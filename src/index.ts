import {
  reportError,
  sequelize
} from 'node-server-engine';
import { createServer } from 'app';
import * as models from 'db/models';
import { runCustomMigrations } from './utils/migrations';

async function main() {
  console.log('--- Starting server initialization ---');
  try {
    console.log('[Step 1] Creating and initializing server');
    const server = createServer();
    console.log('[Step 1] Server object created, calling init()');
    await server.init();
    console.log('[Step 1] Server initialized');

    console.log('[Step 2] Initializing Sequelize');
    await sequelize.init();
    console.log('[Step 2] Sequelize initialized');

    // Suppress Sequelize warnings about public class fields
    process.env.SEQUELIZE_DISABLE_PUBLIC_CLASS_FIELDS_WARNING = 'true';
    console.log('[Step 2] Adding models');
    await sequelize.addModels(Object.values(models));

    if (process.env.RUN_DB_MIGRATION?.toLowerCase() === 'true') {
      console.log('[Step 3] Running custom migrations (no sequelize_meta table)');
      await runCustomMigrations();
      console.log('[Step 3] Custom migrations completed');
    }
  } catch (e) {
    console.error('[ERROR] Server startup failed:', e);
    reportError(e);
    await new Promise((r) => setTimeout(r, 5000));
    process.exit(1);
  }
}

main();
