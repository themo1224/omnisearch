import { esClient } from './client.js';

async function main() {
  // 1. Re-create index with an Edge N-Gram Autocomplete Analyzer
  await esClient.indices.delete({ index: 'posts', ignore_unavailable: true });

  await esClient.indices.create({
    index: 'posts',
    body: {
      settings: {
        analysis: {
          tokenizer: {
            // Split words into prefixes from 2 to 10 characters long
            my_ngram_tokenizer: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 10,
              token_chars: ['letter', 'digit'],
            },
          },
          analyzer: {
            autocomplete_index_analyzer: {
              type: 'custom',
              tokenizer: 'my_ngram_tokenizer',
              filter: ['lowercase'],
            },
          },
        },
      },
      mappings: {
        properties: {
          title: {
            type: 'text',
            fields: {
              // Sub-field specifically for fast autocomplete!
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_index_analyzer',
              },
            },
          },
          content: { type: 'text' },
          views: { type: 'integer' },
          tags: { type: 'keyword' },
        },
      },
    },
  });

  // 2. Add sample documents
  await esClient.index({
    index: 'posts',
    document: { title: 'Elasticsearch Mastery Guide', content: 'Learn full-text search', views: 500, tags: ['search'] },
  });
  await esClient.index({
    index: 'posts',
    document: { title: 'Node.js Express Server Setup', content: 'Build backend APIs', views: 300, tags: ['nodejs'] },
  });

  // Force refresh index so docs are searchable immediately
  await esClient.indices.refresh({ index: 'posts' });

  // 3. TEST AUTOCOMPLETE: Search for prefix "elast"
  const response = await esClient.search({
    index: 'posts',
    query: {
      match: {
        'title.autocomplete': 'elast', // Matches "Elasticsearch"!
      },
    },
  });

  console.log('\n--- Autocomplete Suggestions for "elast" ---');
  for (const hit of response.hits.hits) {
    console.log(`✨ Suggestion: "${hit._source.title}"`);
  }
}

main().catch(console.error);
