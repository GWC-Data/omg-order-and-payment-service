import {
  reportError,
  reportInfo,
  sequelize,
  runPendingMigrations
} from 'node-server-engine';
import { createServer } from 'app';
import * as models from 'db/models';

// Handle unhandled promise rejections to prevent crashes from database issues
process.on('unhandledRejection', (reason) => {
  reportError('Unhandled Promise Rejection (process will continue)');
  reportError(reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  reportError('Uncaught Exception');
  reportError(error);
});


// Start the HTTP server first to pass Cloud Run health checks
createServer()
  .init()
  .then(async () => {
    reportInfo('HTTP server started successfully');

    try {
      reportInfo('Initializing Sequelize...');
      await sequelize.init();

      reportInfo('Adding models to Sequelize...');
      const modelArray = Object.values(models);
      await sequelize.addModels(modelArray); // ensure all models are added

      // Run migrations only if RUN_DB_MIGRATION is true
      if (process.env.RUN_DB_MIGRATION?.toLowerCase() === 'true') {
        reportInfo('Database migration started');
        await runPendingMigrations();
        reportInfo('Database migrations completed');
      } else {
        reportInfo('Skipping database migrations (RUN_DB_MIGRATION not set to true)');
      }

      reportInfo('Sequelize initialization complete, models ready to use');
    } catch (dbError) {
      reportError('Database initialization failed');
      reportError({
        message: dbError instanceof Error ? dbError.message : 'Unknown error',
        stack: dbError instanceof Error ? dbError.stack : undefined,
        error: dbError
      });
      // Exit if DB init fails
      process.exit(1);
    }
  })
  .catch((error) => {
    reportError('Failed to start HTTP server');
    reportError(error);
    process.exit(1);
  });
