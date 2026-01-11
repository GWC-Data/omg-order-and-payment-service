import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tableName = 'Orders';
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  try {
    const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();
    if (!tables.includes(tableName)) {
      console.log(`[MIGRATION] Table ${tableName} does not exist, skipping...`);
      return;
    }

    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        ALTER COLUMN "paymentId" TYPE VARCHAR(255)
        USING CASE 
          WHEN "paymentId" IS NULL THEN NULL
          ELSE "paymentId"::TEXT
        END;
      `);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        MODIFY paymentId VARCHAR(255) NULL;
      `);
    } else if (dialect === 'mssql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ALTER COLUMN paymentId NVARCHAR(255) NULL;
      `);
    }

    console.log(`[MIGRATION] Changed paymentId column from UUID to STRING in ${tableName}`);
  } catch (error) {
    console.error('[MIGRATION] Error changing paymentId column type:', error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tableName = 'Orders';
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  try {
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        ALTER COLUMN "paymentId" TYPE UUID
        USING NULL;
      `);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        MODIFY paymentId CHAR(36) NULL;
      `);
    } else if (dialect === 'mssql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ALTER COLUMN paymentId UNIQUEIDENTIFIER NULL;
      `);
    }

    console.log(`[MIGRATION] Reverted paymentId column back to UUID in ${tableName}`);
  } catch (error) {
    console.error('[MIGRATION] Error reverting paymentId column type:', error);
    throw error;
  }
}
