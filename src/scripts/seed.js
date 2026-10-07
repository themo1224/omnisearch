import { initializeIndexAndAlias } from '../services/index.service.js';
import { seedProductsCatalog } from '../services/seeder.service.js';

async function runSeeder() {
  console.log('🚀 Initializing OmniSearch Hub Seeder Pipeline...');
  await initializeIndexAndAlias();
  await seedProductsCatalog();
  console.log('✨ Seeding Pipeline Finished Successfully!');
  process.exit(0);
}

runSeeder().catch((err) => {
  console.error('Seeder pipeline error:', err);
  process.exit(1);
});
