import {
  reportError,
  sequelize
} from 'node-server-engine';
// NOTE: `sequelizeClient` exists at runtime but isn't re-exported by the package root typings.
// Importing from the concrete file keeps TS happy and avoids `sequelize.addModels()` auto-sync.
import { sequelizeClient } from 'node-server-engine/dist/entities/Sequelize/Sequelize';
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
    const modelArray = Object.values(models);
    /**
     * IMPORTANT:
     * `node-server-engine`'s `sequelize.addModels()` calls `sequelizeClient.sync()` internally.
     * `sync()` is NOT idempotent for indexes on Postgres (no "IF NOT EXISTS") and can crash
     * when an index already exists (e.g. "orders_status").
     *
     * We register models directly on the underlying client and rely on our migrations for schema.
     */
    if (!sequelizeClient) {
      throw new Error('Sequelize client was not initialized (sequelizeClient is undefined)');
    }
    sequelizeClient.addModels(modelArray);

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
