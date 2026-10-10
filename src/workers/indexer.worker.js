import { rabbitMQService, QUEUES, EXCHANGES, ROUTING_KEYS } from '../services/rabbitmq.service.js';
import { indexSingleProduct } from '../services/index.service.js';

const MAX_RETRIES = 3;

/**
 * Production-Grade RabbitMQ Consumer Worker for Elasticsearch Indexing
 */
async function startWorker() {
  console.log('⚡ Starting RabbitMQ Search Indexer Worker...');

  try {
    // 1. Establish RabbitMQ Connection & Topology
    const { channel } = await rabbitMQService.connect();

    // 2. Set Backpressure / Prefetch limit
    // Tells RabbitMQ not to give this worker more than 10 unacked messages at once.
    await channel.prefetch(10);
    console.log('📌 Worker configured with prefetch limit of 10.');

    // 3. Start Consuming Messages from Main Queue
    console.log(`📡 Listening for indexing jobs on queue "${QUEUES.INDEX_QUEUE}"...`);

    await channel.consume(
      QUEUES.INDEX_QUEUE,
      async (msg) => {
        if (!msg) return;

        let payload = null;
        try {
          // Parse message payload
          const rawContent = msg.content.toString();
          payload = JSON.parse(rawContent);

          console.log(`\n📥 [Worker] Received Job ${msg.properties.messageId || ''}: Indexing product "${payload.title}" (${payload.id})...`);

          // Execute heavy Elasticsearch indexing work
          await indexSingleProduct(payload);

          console.log(`✅ [Worker] Successfully indexed product ${payload.id} in Elasticsearch!`);

          // MANUAL ACKNOWLEDGEMENT: Tell RabbitMQ to safely delete the message from the queue
          channel.ack(msg);
        } catch (error) {
          console.error(`❌ [Worker] Error processing message:`, error.message);

          // Track retries using AMQP message headers
          const headers = msg.properties.headers || {};
          const currentRetries = (headers['x-retry-count'] || 0) + 1;

          if (currentRetries >= MAX_RETRIES) {
            console.error(`🚨 [Worker] Poison message detected! Failed ${currentRetries} times. Rejecting to Dead-Letter Queue (DLQ)...`);
            
            // Requeue: false causes RabbitMQ to forward the message to Dead-Letter Exchange (app.events.dlx)
            channel.reject(msg, false);
          } else {
            console.warn(`🔄 [Worker] Re-queuing job for retry attempt ${currentRetries}/${MAX_RETRIES}...`);
            
            // Re-publish to exchange with updated retry count header
            await rabbitMQService.publish(
              msg.fields.routingKey || ROUTING_KEYS.DOC_INDEX,
              payload || {},
              {
                headers: { ...headers, 'x-retry-count': currentRetries },
                messageId: msg.properties.messageId,
              }
            );

            // Ack original failed message to clear it from queue head
            channel.ack(msg);
          }
        }
      },
      { noAck: false } // Force manual ACKs for reliable at-least-once processing
    );

  } catch (error) {
    console.error('Fatal Worker Error:', error);
    process.exit(1);
  }
}

// Handle Graceful Shutdown (e.g. Ctrl+C or Docker stop)
async function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down worker gracefully...`);
  await rabbitMQService.close();
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Launch the worker process
startWorker();
