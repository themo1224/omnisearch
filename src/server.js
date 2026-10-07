import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes.js';
import { initializeIndexAndAlias } from './services/index.service.js';
import { seedProductsCatalog } from './services/seeder.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Mount API V1 Routes
app.use('/api/v1', apiRoutes);

function startServer(listenPort) {
  const server = app.listen(listenPort, async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 OmniSearch Hub API Running on: http://localhost:${listenPort}`);
    console.log(`======================================================\n`);

    try {
      await initializeIndexAndAlias();
      await seedProductsCatalog();
    } catch (err) {
      console.warn('Initialization note:', err.message);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      const nextPort = Number(listenPort) + 1;
      startServer(nextPort);
    } else {
      console.error('Server Startup Error:', err);
    }
  });
}

startServer(port);
