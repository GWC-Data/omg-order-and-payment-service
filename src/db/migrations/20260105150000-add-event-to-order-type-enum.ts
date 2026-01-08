import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  try {
    if (dialect === 'postgres') {
      // PostgreSQL: Add 'event' to the existing enum
      await queryInterface.sequelize.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'event' 
            AND enumtypid = (
              SELECT oid FROM pg_type WHERE typname = 'enum_Orders_orderType'
            )
          ) THEN
            ALTER TYPE "enum_Orders_orderType" ADD VALUE 'event';
          END IF;
        END $$;
      `);
      console.log("Added 'event' to orderType enum in PostgreSQL");
    } else if (dialect === 'mysql') {
      // MySQL: Check if enum already has 'event', if not, alter the column
      const [results] = await queryInterface.sequelize.query(`
        SELECT COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'Orders' 
        AND COLUMN_NAME = 'orderType'
      `) as any[];

      if (results && results.length > 0) {
        const columnType = results[0].COLUMN_TYPE;
        if (!columnType.includes("'event'")) {
          await queryInterface.sequelize.query(`
            ALTER TABLE \`Orders\`
            MODIFY COLUMN \`orderType\` ENUM('darshan', 'puja', 'prasad', 'product', 'event') NOT NULL;
          `);
          console.log("Added 'event' to orderType enum in MySQL");
        } else {
          console.log("'event' already exists in orderType enum in MySQL");
        }
      }
    } else if (dialect === 'mssql') {
      // MSSQL: Check if constraint exists, then alter if needed
      // MSSQL doesn't have native ENUM, uses CHECK constraints
      const [results] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS 
        WHERE CONSTRAINT_NAME LIKE '%orderType%'
      `) as any[];

      if (results && results.length > 0) {
        // Drop existing constraint
        await queryInterface.sequelize.query(`
          ALTER TABLE Orders
          DROP CONSTRAINT ${results[0].CONSTRAINT_NAME};
        `);
      }

      // Add new constraint with 'event' included
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ADD CONSTRAINT CK_Orders_orderType 
        CHECK (orderType IN ('darshan', 'puja', 'prasad', 'product', 'event'));
      `);
      console.log("Added 'event' to orderType constraint in MSSQL");
    } else {
      console.warn(`Unsupported database dialect: ${dialect}. Please manually add 'event' to orderType enum.`);
    }
  } catch (error) {
    console.error('Error adding event to orderType enum:', error);
    // Don't throw - allow migration to continue even if enum already has the value
    // This makes the migration idempotent
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  try {
    if (dialect === 'postgres') {
      // PostgreSQL: Cannot remove enum values directly, would need to recreate enum
      // This is a destructive operation, so we'll just log a warning
      console.warn("PostgreSQL does not support removing enum values. Manual intervention required if you need to remove 'event'.");
    } else if (dialect === 'mysql') {
      // MySQL: Remove 'event' from enum
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Orders\`
        MODIFY COLUMN \`orderType\` ENUM('darshan', 'puja', 'prasad', 'product') NOT NULL;
      `);
      console.log("Removed 'event' from orderType enum in MySQL");
    } else if (dialect === 'mssql') {
      // MSSQL: Update constraint to remove 'event'
      const [results] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS 
        WHERE CONSTRAINT_NAME LIKE '%orderType%'
      `) as any[];

      if (results && results.length > 0) {
        await queryInterface.sequelize.query(`
          ALTER TABLE Orders
          DROP CONSTRAINT ${results[0].CONSTRAINT_NAME};
        `);
      }

      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ADD CONSTRAINT CK_Orders_orderType 
        CHECK (orderType IN ('darshan', 'puja', 'prasad', 'product'));
      `);
      console.log("Removed 'event' from orderType constraint in MSSQL");
    }
  } catch (error) {
    console.error('Error removing event from orderType enum:', error);
    // Don't throw - allow rollback to continue
  }
}

