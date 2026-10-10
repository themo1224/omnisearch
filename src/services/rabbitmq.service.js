import amqp from 'amqplib';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

// The connection string: amqp://username:password@host:port
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

// -------------------------------------------------------------
// 1. TOPOLOGY CONSTANTS
// Centralize all names so typos don't break message routing.
// -------------------------------------------------------------
export const EXCHANGES = {
  EVENTS: 'app.events',        // Topic exchange for business events
  DLX: 'app.events.dlx',       // Dead-Letter Exchange for failed messages
};

export const QUEUES = {
  INDEX_QUEUE: 'search.index.queue', // Main work queue
  INDEX_DLQ: 'search.index.dlq',     // Quarantine queue for poison/failed messages
};

export const ROUTING_KEYS = {
  DOC_INDEX: 'doc.index',      // Routing key for index jobs
  DLQ: 'search.index.dlq',     // Routing key for dead-letter queue
};

class RabbitMQService {
  constructor() {
    this.connection = null; // The single, heavy TCP connection to RabbitMQ
    this.channel = null;    // The lightweight virtual channel multiplexed inside
    this.isConnecting = false;
    this.manuallyClosed = false;
  }

  // -----------------------------------------------------------
  // 2. CONNECTION & RECONNECT LIFECYCLE
  // In production, networks blink. Never let a drop crash the app.
  // -----------------------------------------------------------
  async connect() {
    // If already connected, reuse the channel (Channels are cheap, connections are heavy)
    if (this.connection && this.channel) {
      return { connection: this.connection, channel: this.channel };
    }

    if (this.isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      console.log(`🔌 Connecting to RabbitMQ at ${RABBITMQ_URL}...`);
      this.connection = await amqp.connect(RABBITMQ_URL);

      // Handle unexpected connection drop
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ Connection Error:', err.message);
      });

      this.connection.on('close', () => {
        if (this.manuallyClosed) return; // Don't auto-reconnect if we called close()
        console.warn('⚠️ Connection lost! Auto-reconnecting in 5 seconds...');
        this.connection = null;
        this.channel = null;
        setTimeout(() => this.connect(), 5000);
      });

      // Create a virtual channel inside the TCP connection
      this.channel = await this.connection.createChannel();

      // Setup the routing structure (exchanges, queues, bindings)
      await this.setupTopology();

      console.log('✅ RabbitMQ connected & topology initialized.');
      return { connection: this.connection, channel: this.channel };
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error.message);
      this.connection = null;
      this.channel = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  // -----------------------------------------------------------
  // 3. TOPOLOGY DECLARATION (Idempotent: safe to run many times)
  // -----------------------------------------------------------
  async setupTopology() {
    if (!this.channel) throw new Error('Channel not established');

    // A. Setup Dead-Letter Exchange (DLX) & Dead-Letter Queue (DLQ)
    // Direct exchange: exact match on routing key
    await this.channel.assertExchange(EXCHANGES.DLX, 'direct', { durable: true });
    await this.channel.assertQueue(QUEUES.INDEX_DLQ, { durable: true });
    await this.channel.bindQueue(QUEUES.INDEX_DLQ, EXCHANGES.DLX, ROUTING_KEYS.DLQ);

    // B. Setup Main Exchange
    // Topic exchange: allows wildcard routing like "doc.*" or "doc.#"
    await this.channel.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });

    // C. Setup Main Queue with DLQ Forwarding
    // If a message in this queue is rejected (nack), RabbitMQ forwards it to DLX automatically!
    await this.channel.assertQueue(QUEUES.INDEX_QUEUE, {
      durable: true, // Survives broker restarts
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.DLX,
        'x-dead-letter-routing-key': ROUTING_KEYS.DLQ,
      },
    });

    // D. Bind Main Queue to Main Exchange
    // "doc.#" means: route any message starting with "doc." into this queue
    await this.channel.bindQueue(QUEUES.INDEX_QUEUE, EXCHANGES.EVENTS, 'doc.#');

    console.log('📦 Topology asserted: Exchanges, Queues, DLQ & Bindings verified.');
  }

  // -----------------------------------------------------------
  // 4. PUBLISHING HELPER (Producer Side)
  // -----------------------------------------------------------
  async publish(routingKey, messageData, options = {}) {
    if (!this.channel) {
      await this.connect();
    }

    // RabbitMQ transmits raw byte buffers, so we serialize JSON to Buffer
    const payloadBuffer = Buffer.from(JSON.stringify(messageData));
    const messageId = options.messageId || crypto.randomUUID();

    const publishOptions = {
      persistent: true,          // CRITICAL: Saves message to disk, survives broker reboot
      contentType: 'application/json',
      messageId,                 // Allows consumers to be idempotent (deduplicate)
      timestamp: Date.now(),
      headers: options.headers || {},
      ...options,
    };

    // Publish to the EXCHANGE, never directly to a queue!
    const isPublished = this.channel.publish(
      EXCHANGES.EVENTS,
      routingKey,
      payloadBuffer,
      publishOptions
    );

    return { messageId, routingKey, success: isPublished };
  }

  // -----------------------------------------------------------
  // 5. CLEAN DISCONNECT (Graceful Shutdown)
  // -----------------------------------------------------------
  async close() {
    try {
      this.manuallyClosed = true;
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      console.log('🔌 RabbitMQ connection closed cleanly.');
    } catch (err) {
      console.error('Error closing RabbitMQ connection:', err.message);
    }
  }
}

// Export a singleton instance
export const rabbitMQService = new RabbitMQService();
