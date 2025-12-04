import { Server, sequelize, runPendingMigrations } from 'node-server-engine';
import {
  generatePkiEnvironment,
  generateEcdsaKeyPair
} from 'backend-test-tools';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Application } from 'express';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { createServer } from 'app/createServer';
import * as models from 'db/models';
import './env';

chai.use(chaiAsPromised);
chai.use(sinonChai);

/**
 * Global test hooks
 */

// Save a copy to revert the environment variables to their original state before each test
const savedEnv = { ...process.env };
export let server: Server;
export let app: Application;

before(async () => {
  // Generate certificates and keys
  generatePkiEnvironment();
  generateEcdsaKeyPair();
  server = createServer();

  app = server.getApp();
  await server.init();

  await sequelize.init();
  const modelArray = Object.values(models);
  await sequelize.addModels(modelArray);
  if (process.env.RUN_DB_MIGRATION?.toLowerCase() === 'true') {
    console.log('Db Migration Started');
    await runPendingMigrations();
  }
});

beforeEach(() => {
  process.env = { ...savedEnv };
});

afterEach(() => {
  // Delete all stubs and spies
  sinon.restore();
});

after(async () => {
  await server.shutdown();
});
