export const ALIAS_NAME = 'products_search_alias';
export const INITIAL_INDEX_NAME = 'products_v1';

export const INDEX_CONFIG = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      tokenizer: {
        edge_ngram_tokenizer: {
          type: 'edge_ngram',
          min_gram: 2,
          max_gram: 12,
          token_chars: ['letter', 'digit'],
        },
      },
      analyzer: {
        autocomplete_index: {
          type: 'custom',
          tokenizer: 'edge_ngram_tokenizer',
          filter: ['lowercase'],
        },
        autocomplete_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase'],
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: {
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete_index',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
      description: { type: 'text' },
      category: { type: 'keyword' },
      brand: { type: 'keyword' },
      price: { type: 'float' },
      rating: { type: 'float' },
      in_stock: { type: 'boolean' },
      tags: { type: 'keyword' },
      // 384-dimensional dense vector for semantic KNN search
      vector_embedding: {
        type: 'dense_vector',
        dims: 384,
        index: true,
        similarity: 'cosine',
      },
      created_at: { type: 'date' },
    },
  },
};
