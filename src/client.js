import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';

dotenv.config();

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
});
