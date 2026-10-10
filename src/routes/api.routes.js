import express from 'express';
import { esClient } from '../client.js';
import { executeHybridSearch, executeAutocomplete } from '../services/search.service.js';
import { reindexWithZeroDowntime } from '../services/index.service.js';
import { seedProductsCatalog } from '../services/seeder.service.js';
import { ALIAS_NAME } from '../config/index-settings.js';
import { rabbitMQService, ROUTING_KEYS } from '../services/rabbitmq.service.js';
const router = express.Router();

/**
 * GET /api/v1/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    const aliasInfo = await esClient.indices.getAlias({ name: ALIAS_NAME });
    res.json({
      status: 'ok',
      clusterName: health.cluster_name,
      clusterStatus: health.status,
      activeAlias: ALIAS_NAME,
      backingIndex: Object.keys(aliasInfo)[0] || 'unknown',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/v1/search
 */
router.get('/search', async (req, res) => {
  try {
    const { q, category, brand, minPrice, maxPrice, inStock, mode, sort } = req.query;
    const result = await executeHybridSearch({
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      mode,
      sort,
    });
    res.json(result);
  } catch (err) {
    console.error('Search API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/autocomplete
 */
router.get('/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;
    const result = await executeAutocomplete(q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/admin/reindex
 * Zero-downtime alias swap
 */
router.post('/admin/reindex', async (req, res) => {
  try {
    const migration = await reindexWithZeroDowntime();
    res.json({
      status: 'success',
      message: 'Zero-downtime alias reindex completed successfully!',
      migration,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/admin/seed
 */
router.post('/admin/seed', async (req, res) => {
  try {
    await seedProductsCatalog();
    res.json({ status: 'success', message: 'Products catalog seeded successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/v1/products
 * Asynchronously queues a product for background indexing via RabbitMQ
 */
router.post('/products', async (req, res) => {
  try {
    const product = req.body;

    // Fast validation: Reject obviously bad requests before queuing
    if (!product || !product.title) {
      return res.status(400).json({ error: 'Product title is required' });
    }

    // Build the payload
    const productId = product.id || `prod_${Date.now()}`;
    const payload = {
      id: productId,
      title: product.title,
      description: product.description || '',
      category: product.category || 'General',
      brand: product.brand || 'Generic',
      price: Number(product.price) || 0,
      inStock: product.inStock !== false,
      timestamp: new Date().toISOString(),
    };

    // 1. PUBLISH TO RABBITMQ (Non-blocking, takes ~2ms)
    // We send to the exchange with routing key "doc.index"
    const { messageId } = await rabbitMQService.publish(
      ROUTING_KEYS.DOC_INDEX,
      payload
    );

    // 2. RESPOND WITH 202 ACCEPTED
    // 202 tells the client: "We got it, accepted it, and are processing it in the background"
    res.status(202).json({
      status: 'accepted',
      message: 'Product accepted and queued for indexing in the background',
      jobId: messageId,
      productId: productId,
    });
  } catch (err) {
    console.error('Failed to queue product:', err);
    res.status(500).json({ error: err.message });
  }
  
});

export default router;
