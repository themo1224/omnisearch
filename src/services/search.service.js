import { esClient } from '../client.js';
import { ALIAS_NAME } from '../config/index-settings.js';
import { generateEmbedding } from './vector.service.js';

export async function executeHybridSearch({
  q = '',
  category = '',
  brand = '',
  minPrice = null,
  maxPrice = null,
  inStock = null,
  mode = 'hybrid', // 'hybrid' | 'keyword'
  sort = '_score',
}) {
  const must = [];
  const filter = [];
  const should = [];

  const queryText = q.trim();

  // 1. Full-Text BM25 Query Construction
  if (queryText) {
    must.push({
      multi_match: {
        query: queryText,
        fields: ['title^3', 'brand^2', 'description', 'tags^1.5'],
        fuzziness: 'AUTO', // Typo tolerance
        operator: 'or',
      },
    });
  } else {
    must.push({ match_all: {} });
  }

  // 2. Structured Filters (Fast & Cached by Lucene)
  if (category) filter.push({ term: { category } });
  if (brand) filter.push({ term: { brand } });

  if (minPrice !== null || maxPrice !== null) {
    const rangeObj = {};
    if (minPrice !== null && !isNaN(minPrice)) rangeObj.gte = parseFloat(minPrice);
    if (maxPrice !== null && !isNaN(maxPrice)) rangeObj.lte = parseFloat(maxPrice);
    filter.push({ range: { price: rangeObj } });
  }

  if (inStock !== null && inStock !== undefined && inStock !== '') {
    filter.push({ term: { in_stock: inStock === 'true' || inStock === true } });
  }

  // 3. Boosting Rule: Rating >= 4.7 gets a bonus score boost
  should.push({ range: { rating: { gte: 4.7, boost: 1.5 } } });

  // 4. Construct Base Query Object
  const searchPayload = {
    index: ALIAS_NAME,
    query: {
      bool: {
        must,
        filter,
        should,
      },
    },
    highlight: {
      pre_tags: ['<em>'],
      post_tags: ['</em>'],
      fields: {
        title: {},
        description: {},
      },
    },
    aggs: {
      categories: {
        terms: { field: 'category', size: 10 },
      },
      brands: {
        terms: { field: 'brand', size: 10 },
      },
      price_stats: {
        stats: { field: 'price' },
      },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { to: 200, key: 'Budget (< $200)' },
            { from: 200, to: 1000, key: 'Mid-Tier ($200 - $1,000)' },
            { from: 1000, key: 'Flagship / Pro ($1,000+)' },
          ],
        },
      },
    },
  };

  // 5. Add Dense Vector kNN Search if Mode is 'hybrid' and a search term exists
  if (mode === 'hybrid' && queryText) {
    const queryVector = generateEmbedding(queryText);
    searchPayload.knn = {
      field: 'vector_embedding',
      query_vector: queryVector,
      k: 5,
      num_candidates: 20,
      boost: 0.5, // Balance BM25 score with vector similarity score
    };
  }

  // 6. Sorting
  if (sort === 'price_asc') searchPayload.sort = [{ price: { order: 'asc' } }];
  else if (sort === 'price_desc') searchPayload.sort = [{ price: { order: 'desc' } }];
  else if (sort === 'rating_desc') searchPayload.sort = [{ rating: { order: 'desc' } }];
  else searchPayload.sort = [{ _score: { order: 'desc' } }];

  // Execute Elasticsearch search
  const esResult = await esClient.search(searchPayload);

  return {
    queryExecuted: searchPayload,
    total: esResult.hits.total?.value ?? esRes.hits.total,
    took: esResult.took,
    hits: esResult.hits.hits.map(h => ({
      id: h._id,
      score: h._score,
      highlight: h.highlight,
      ...h._source,
    })),
    aggregations: esResult.aggregations,
  };
}

export async function executeAutocomplete(prefix = '') {
  if (!prefix || prefix.trim().length < 2) {
    return { suggestions: [] };
  }

  const response = await esClient.search({
    index: ALIAS_NAME,
    size: 5,
    _source: ['title', 'category', 'brand', 'price'],
    query: {
      match: {
        'title.autocomplete': {
          query: prefix.trim(),
          operator: 'and',
        },
      },
    },
  });

  return {
    suggestions: response.hits.hits.map(h => ({
      id: h._id,
      title: h._source.title,
      category: h._source.category,
      brand: h._source.brand,
      price: h._source.price,
    })),
  };
}
