import { esClient } from '../client.js';
import { ALIAS_NAME, INITIAL_INDEX_NAME, INDEX_CONFIG } from '../config/index-settings.js';
import { generateEmbedding } from './vector.service.js';

export async function initializeIndexAndAlias() {
  const aliasExists = await esClient.indices.existsAlias({ name: ALIAS_NAME });

  if (!aliasExists) {
    console.log(`Alias "${ALIAS_NAME}" not found. Initializing physical index "${INITIAL_INDEX_NAME}"...`);

    const indexExists = await esClient.indices.exists({ index: INITIAL_INDEX_NAME });
    if (indexExists) {
      await esClient.indices.delete({ index: INITIAL_INDEX_NAME });
    }

    await esClient.indices.create({
      index: INITIAL_INDEX_NAME,
      body: INDEX_CONFIG,
    });

    await esClient.indices.putAlias({
      index: INITIAL_INDEX_NAME,
      name: ALIAS_NAME,
    });

    console.log(` Index "${INITIAL_INDEX_NAME}" created & alias "${ALIAS_NAME}" attached!`);
  }
}

/**
 * Performs a zero-downtime index migration & alias swap
 */
export async function reindexWithZeroDowntime() {
  console.log(` Starting Zero-Downtime Reindexing Pipeline...`);

  // Find current index pointing to alias
  const aliasInfo = await esClient.indices.getAlias({ name: ALIAS_NAME });
  const currentIndexName = Object.keys(aliasInfo)[0] || INITIAL_INDEX_NAME;

  // Generate new index version name (e.g. products_v1 -> products_v2)
  const currentVersionNumber = parseInt(currentIndexName.replace(/\D/g, '') || '1', 10);
  const newIndexName = `products_v${currentVersionNumber + 1}`;

  console.log(`Current Index: ${currentIndexName} ➔ New Target Index: ${newIndexName}`);

  // 1. Create new physical index with current mapping/settings config
  const newIndexExists = await esClient.indices.exists({ index: newIndexName });
  if (newIndexExists) {
    await esClient.indices.delete({ index: newIndexName });
  }

  await esClient.indices.create({
    index: newIndexName,
    body: INDEX_CONFIG,
  });

  // 2. Reindex data from old index to new index
  console.log(`Reindexing data from ${currentIndexName} to ${newIndexName}...`);
  await esClient.reindex({
    wait_for_completion: true,
    body: {
      source: { index: currentIndexName },
      dest: { index: newIndexName },
    },
  });

  await esClient.indices.refresh({ index: newIndexName });

  // 3. Atomic Alias Swap (Zero Downtime Transaction!)
  console.log(`Swapping alias "${ALIAS_NAME}" atomically...`);
  await esClient.indices.updateAliases({
    body: {
      actions: [
        { remove: { index: currentIndexName, alias: ALIAS_NAME } },
        { add: { index: newIndexName, alias: ALIAS_NAME } },
      ],
    },
  });

  // 4. Delete old index
  await esClient.indices.delete({ index: currentIndexName });

  console.log(` Zero-downtime reindexing complete! Alias "${ALIAS_NAME}" now points to "${newIndexName}".`);

  return {
    oldIndex: currentIndexName,
    newIndex: newIndexName,
    alias: ALIAS_NAME,
  };
}

/**
 * Indexes or updates a single product document in Elasticsearch with vector embeddings
 */
export async function indexSingleProduct(product) {
  const vectorText = `${product.title || ''} ${product.description || ''} ${product.category || ''} ${(product.tags || []).join(' ')}`;
  const embedding = generateEmbedding(vectorText);

  const document = {
    id: product.id,
    title: product.title,
    description: product.description || '',
    category: product.category || 'General',
    brand: product.brand || 'Generic',
    price: Number(product.price) || 0,
    rating: Number(product.rating) || 5.0,
    in_stock: product.in_stock !== false && product.inStock !== false,
    tags: Array.isArray(product.tags) ? product.tags : [product.category || 'general'],
    created_at: product.created_at || new Date().toISOString(),
    vector_embedding: embedding,
  };

  await esClient.index({
    index: ALIAS_NAME,
    id: product.id,
    document,
    refresh: true, // Make immediately searchable
  });

  return document;
}
