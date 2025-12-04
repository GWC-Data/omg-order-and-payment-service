import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { sequelize } from 'node-server-engine';

export async function runCustomMigrations(): Promise<void> {
  const migrationsPath = join(process.cwd(), 'src/db/migrations');

  if (!existsSync(migrationsPath)) {
    console.log('No migrations directory found, skipping migrations');
    return;
  }

  const migrationFiles = readdirSync(migrationsPath)
    .filter(file => file.endsWith('.ts'))
    .sort();

  console.log(`Found ${migrationFiles.length} migration files`);

  for (const migrationFile of migrationFiles) {
    console.log(`Running migration: ${migrationFile}`);

    try {
      // Import the migration file
      const migrationModule = await import(join(migrationsPath, migrationFile));

      // Run the up function if it exists
      if (migrationModule.up && typeof migrationModule.up === 'function') {
        await migrationModule.up(sequelize.getQueryInterface());
        console.log(`✓ Migration ${migrationFile} completed successfully`);
      } else {
        console.log(`⚠ Migration ${migrationFile} has no up function, skipping`);
      }
    } catch (error) {
      console.error(`✗ Migration ${migrationFile} failed:`, error);
      // Continue with other migrations even if one fails
    }
  }

  console.log('All custom migrations processed');
}

