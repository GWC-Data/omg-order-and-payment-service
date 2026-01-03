import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  // Check if table exists
  try {
    await queryInterface.describeTable('Orders');
  } catch {
    console.log('Orders table does not exist, skipping migration');
    return;
  }

  // Add shippingAddress column
  try {
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
      `);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ADD COLUMN IF NOT EXISTS shippingAddress TEXT;
      `);
    } else if (dialect === 'mssql') {
      await queryInterface.sequelize.query(`
        IF NOT EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'Orders') 
          AND name = 'shippingAddress'
        )
        ALTER TABLE Orders
        ADD shippingAddress NVARCHAR(MAX);
      `);
    }
  } catch (error) {
    console.error('Error adding shippingAddress column:', error);
    // Continue even if column already exists
  }

  // Add deliveryType column (ENUM)
  try {
    if (dialect === 'postgres') {
      // Check if enum type exists, create if not
      const enumCheck = await queryInterface.sequelize.query(`
        SELECT 1 FROM pg_type WHERE typname = 'delivery_type_enum';
      `);
      
      if ((enumCheck[0] as any[]).length === 0) {
        await queryInterface.sequelize.query(`
          CREATE TYPE delivery_type_enum AS ENUM ('standard', 'express');
        `);
      }

      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        ADD COLUMN IF NOT EXISTS "deliveryType" delivery_type_enum;
      `);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        ADD COLUMN IF NOT EXISTS deliveryType ENUM('standard', 'express');
      `);
    } else if (dialect === 'mssql') {
      // MSSQL doesn't support ENUM, use VARCHAR with CHECK constraint
      await queryInterface.sequelize.query(`
        IF NOT EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'Orders') 
          AND name = 'deliveryType'
        )
        ALTER TABLE Orders
        ADD deliveryType VARCHAR(20);
        
        IF NOT EXISTS (
          SELECT * FROM sys.check_constraints 
          WHERE name = 'CK_Orders_deliveryType'
        )
        ALTER TABLE Orders
        ADD CONSTRAINT CK_Orders_deliveryType 
        CHECK (deliveryType IN ('standard', 'express') OR deliveryType IS NULL);
      `);
    }
  } catch (error) {
    console.error('Error adding deliveryType column:', error);
    // Continue even if column already exists
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  try {
    await queryInterface.describeTable('Orders');
  } catch {
    return; // Table doesn't exist, nothing to rollback
  }

  // Remove deliveryType column
  try {
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        DROP COLUMN IF EXISTS "deliveryType";
      `);
      // Optionally drop enum type (only if not used elsewhere)
      // await queryInterface.sequelize.query(`DROP TYPE IF EXISTS delivery_type_enum;`);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        DROP COLUMN IF EXISTS deliveryType;
      `);
    } else if (dialect === 'mssql') {
      await queryInterface.sequelize.query(`
        IF EXISTS (
          SELECT * FROM sys.check_constraints 
          WHERE name = 'CK_Orders_deliveryType'
        )
        ALTER TABLE Orders
        DROP CONSTRAINT CK_Orders_deliveryType;
        
        IF EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'Orders') 
          AND name = 'deliveryType'
        )
        ALTER TABLE Orders
        DROP COLUMN deliveryType;
      `);
    }
  } catch (error) {
    console.error('Error removing deliveryType column:', error);
  }

  // Remove shippingAddress column
  try {
    if (dialect === 'postgres') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Orders"
        DROP COLUMN IF EXISTS "shippingAddress";
      `);
    } else if (dialect === 'mysql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Orders
        DROP COLUMN IF EXISTS shippingAddress;
      `);
    } else if (dialect === 'mssql') {
      await queryInterface.sequelize.query(`
        IF EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'Orders') 
          AND name = 'shippingAddress'
        )
        ALTER TABLE Orders
        DROP COLUMN shippingAddress;
      `);
    }
  } catch (error) {
    console.error('Error removing shippingAddress column:', error);
  }
}

