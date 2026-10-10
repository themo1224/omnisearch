import { rabbitMQService, ROUTING_KEYS } from '../services/rabbitmq.service.js';

async function runDemo() {
  console.log('🚀 Running RabbitMQ End-to-End Pipeline Test...\n');

  const testProduct = {
    id: `demo-prod-${Date.now()}`,
    title: 'Sony Bravia 65" 4K OLED Smart TV',
    description: 'Stunning 4K OLED display with Cognitive Processor XR, Dolby Vision, and HDMI 2.1 for PS5 gaming.',
    category: 'TVs & Home Theater',
    brand: 'Sony',
    price: 1799.99,
    inStock: true,
    tags: ['tv', 'oled', '4k', 'sony', 'gaming', 'smart-tv'],
    created_at: new Date().toISOString(),
  };

  console.log('📤 Publishing product message to exchange "app.events" with routing key "doc.index"...');
  console.log('Payload:', JSON.stringify(testProduct, null, 2));

  const result = await rabbitMQService.publish(ROUTING_KEYS.DOC_INDEX, testProduct);

  console.log('\n✨ Message Published Successfully!');
  console.log(`🆔 Job / Message ID: ${result.messageId}`);
  console.log(`🔑 Routing Key: ${result.routingKey}`);
  console.log('\n👉 If the indexer worker is running (`npm run worker`), it will pick up this job and index it into Elasticsearch!');

  await rabbitMQService.close();
  process.exit(0);
}

runDemo().catch((err) => {
  console.error('❌ Demo Error:', err);
  process.exit(1);
});
