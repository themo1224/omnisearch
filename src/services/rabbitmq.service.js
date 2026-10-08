import amqp from 'amqplib';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

// Topology definitions
export const EXCHANGES = {
  EVENTS: 'app.events',
  DLX: 'app.events.dlx',
};

export const QUEUES = {
  INDEX_QUEUE: 'search.index.queue',
  INDEX_DLQ: 'search.index.dlq',
};

export const ROUTING_KEYS = {
  DOC_INDEX: 'doc.index',
  DLQ: 'search.index.dlq',
};

class RabbitMQService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnecting = false;
  }

  /**
   * Connect to RabbitMQ broker and initialize topology
   */
  async connect() {
    if (this.connection && this.channel) {
      return { connection: this.connection, channel: this.channel };
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 500));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      console.log(`🔌 Connecting to RabbitMQ at ${RABBITMQ_URL}...`);
      this.connection = await amqp.connect(RABBITMQ_URL);

      // Listen for connection-level errors and broker disconnection
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ Connection Error:', err.message);
      });

      this.connection.on('close', () => {
        if (this.manuallyClosed) return;
        console.warn('⚠️ RabbitMQ Connection closed unexpectedly. Attempting reconnect in 5s...');
        this.connection = null;
        this.channel = null;
        setTimeout(() => this.connect(), 5000);
      });

      // Create communication channel
      this.channel = await this.connection.createChannel();

      // Listen for channel errors
      this.channel.on('error', (err) => {
        console.error('❌ RabbitMQ Channel Error:', err.message);
      });

      this.channel.on('close', () => {
        console.warn('⚠️ RabbitMQ Channel closed.');
        this.channel = null;
      });

      // Setup topology (Exchanges, Queues, DLQ, and Bindings)
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

  /**
   * Asserts the exchanges, queues, dead-letter routes, and bindings.
   * This is idempotent: safe to call repeatedly.
   */
  async setupTopology() {
    if (!this.channel) throw new Error('Channel not established');

    // 1. Dead-Letter Exchange & Dead-Letter Queue
    await this.channel.assertExchange(EXCHANGES.DLX, 'direct', { durable: true });
    await this.channel.assertQueue(QUEUES.INDEX_DLQ, { durable: true });
    await this.channel.bindQueue(QUEUES.INDEX_DLQ, EXCHANGES.DLX, ROUTING_KEYS.DLQ);

    // 2. Main Topic Exchange
    await this.channel.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });

    // 3. Main Work Queue with Dead-Letter Exchange (DLX) forwarding configuration
    await this.channel.assertQueue(QUEUES.INDEX_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.DLX,
        'x-dead-letter-routing-key': ROUTING_KEYS.DLQ,
      },
    });

    // 4. Bind Main Queue to Main Exchange
    // Topic wildcard: "doc.#" matches "doc.index", "doc.update", "doc.bulk.index"
    await this.channel.bindQueue(QUEUES.INDEX_QUEUE, EXCHANGES.EVENTS, 'doc.#');

    console.log('📦 RabbitMQ Topology asserted: Exchanges, Queues, DLQ & Bindings verified.');
  }

  /**
   * Publishes a persistent message to an exchange with a routing key
   */
  async publish(routingKey, messageData, options = {}) {
    if (!this.channel) {
      await this.connect();
    }

    const payloadBuffer = Buffer.from(JSON.stringify(messageData));
    const messageId = options.messageId || crypto.randomUUID();

    const publishOptions = {
      persistent: true,          // Ensures message is written to disk
      contentType: 'application/json',
      messageId,
      timestamp: Date.now(),
      headers: options.headers || {},
      ...options,
    };

    const isPublished = this.channel.publish(
      EXCHANGES.EVENTS,
      routingKey,
      payloadBuffer,
      publishOptions
    );

    if (!isPublished) {
      console.warn('⚠️ Channel buffer full, message queued for drain.');
    }

    return { messageId, routingKey, success: isPublished };
  }

  /**
   * Graceful disconnect
   */
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

export const rabbitMQService = new RabbitMQService();
