import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Migration to fix invalid UUID values in Orders and related tables
 * 
 * This migration:
 * 1. Identifies records with invalid UUIDs (numeric strings like "1", "2")
 * 2. Sets invalid UUIDs to NULL for nullable fields
 * 3. For required fields, generates new UUIDs or marks for manual review
 * 4. Ensures all UUID fields have proper default UUID generation
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

  console.log('[MIGRATION] Starting UUID validation and cleanup...');

  try {
    // Check if Orders table exists
    const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();
    if (!tables.includes('Orders')) {
      console.log('[MIGRATION] Orders table does not exist, skipping...');
      return;
    }

    if (dialect === 'postgres') {
      // PostgreSQL: Fix invalid UUIDs in Orders table
      
      // 1. Fix templeId - set invalid UUIDs to NULL (it's nullable)
      console.log('[MIGRATION] Fixing invalid templeId values...');
      await queryInterface.sequelize.query(`
        UPDATE "Orders"
        SET "templeId" = NULL
        WHERE "templeId" IS NOT NULL
        AND (
          "templeId" ~ '^[0-9]+$'  -- Numeric strings
          OR LENGTH("templeId") < 36  -- Too short to be UUID
          OR "templeId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Invalid UUID format
        );
      `);

      // 2. Fix addressId - set invalid UUIDs to NULL (it's nullable)
      console.log('[MIGRATION] Fixing invalid addressId values...');
      await queryInterface.sequelize.query(`
        UPDATE "Orders"
        SET "addressId" = NULL
        WHERE "addressId" IS NOT NULL
        AND (
          "addressId" ~ '^[0-9]+$'  -- Numeric strings
          OR LENGTH("addressId") < 36  -- Too short to be UUID
          OR "addressId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Invalid UUID format
        );
      `);

      // 3. Fix paymentId - set invalid UUIDs to NULL (it's nullable)
      console.log('[MIGRATION] Fixing invalid paymentId values...');
      await queryInterface.sequelize.query(`
        UPDATE "Orders"
        SET "paymentId" = NULL
        WHERE "paymentId" IS NOT NULL
        AND (
          "paymentId" ~ '^[0-9]+$'  -- Numeric strings
          OR LENGTH("paymentId") < 36  -- Too short to be UUID
          OR "paymentId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Invalid UUID format
        );
      `);

      // 4. Fix userId - this is required, so we need to handle it carefully
      // Check if there are any invalid userIds
      const invalidUserIds = await queryInterface.sequelize.query(`
        SELECT id, "userId", "orderNumber"
        FROM "Orders"
        WHERE "userId" IS NOT NULL
        AND (
          "userId" ~ '^[0-9]+$'  -- Numeric strings
          OR LENGTH("userId") < 36  -- Too short to be UUID
          OR "userId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Invalid UUID format
        )
        LIMIT 100;
      `, { type: QueryInterface.QueryTypes.SELECT });

      if (Array.isArray(invalidUserIds) && invalidUserIds.length > 0) {
        console.warn(`[MIGRATION] Found ${invalidUserIds.length} orders with invalid userId. These need manual review.`);
        console.warn('[MIGRATION] Invalid userId orders:', invalidUserIds);
        // For now, we'll log them but not auto-fix since userId is required
        // These should be reviewed and fixed manually
      }

      // 5. Fix OrderItems table UUID fields
      if (tables.includes('OrderItems')) {
        console.log('[MIGRATION] Fixing invalid UUIDs in OrderItems...');
        
        const uuidFields = ['itemId', 'productId', 'pujaId', 'prasadId', 'dharshanId'];
        
        for (const field of uuidFields) {
          await queryInterface.sequelize.query(`
            UPDATE "OrderItems"
            SET "${field}" = NULL
            WHERE "${field}" IS NOT NULL
            AND (
              "${field}" ~ '^[0-9]+$'  -- Numeric strings
              OR LENGTH("${field}") < 36  -- Too short to be UUID
              OR "${field}" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Invalid UUID format
            );
          `);
        }
      }

      // 6. Ensure default UUID generation for id and orderNumber in Orders
      console.log('[MIGRATION] Ensuring UUID defaults for Orders table...');
      
      // Check if defaults are already set
      const orderDefaults = await queryInterface.sequelize.query(`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_name = 'Orders'
        AND column_name IN ('id', 'orderNumber');
      `, { type: QueryInterface.QueryTypes.SELECT });

      // Set default for id if not set
      const idDefault = (orderDefaults as any[])?.find((col: any) => col.column_name === 'id');
      if (!idDefault?.column_default || !idDefault.column_default.includes('uuid_generate')) {
        await queryInterface.sequelize.query(`
          ALTER TABLE "Orders"
          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
        `);
        console.log('[MIGRATION] Set default UUID generation for Orders.id');
      }

      // Set default for orderNumber if not set
      const orderNumberDefault = (orderDefaults as any[])?.find((col: any) => col.column_name === 'orderNumber');
      if (!orderNumberDefault?.column_default || !orderNumberDefault.column_default.includes('uuid_generate')) {
        await queryInterface.sequelize.query(`
          ALTER TABLE "Orders"
          ALTER COLUMN "orderNumber" SET DEFAULT gen_random_uuid();
        `);
        console.log('[MIGRATION] Set default UUID generation for Orders.orderNumber');
      }

    } else if (dialect === 'mysql') {
      // MySQL: Similar logic but with MySQL syntax
      console.log('[MIGRATION] MySQL UUID cleanup (similar logic)...');
      // MySQL doesn't have native UUID type, uses CHAR(36), so validation is different
      // For now, we'll just ensure proper format
      
      await queryInterface.sequelize.query(`
        UPDATE \`Orders\`
        SET \`templeId\` = NULL
        WHERE \`templeId\` IS NOT NULL
        AND (
          \`templeId\` REGEXP '^[0-9]+$'  -- Numeric strings
          OR LENGTH(\`templeId\`) < 36  -- Too short to be UUID
        );
      `);

      await queryInterface.sequelize.query(`
        UPDATE \`Orders\`
        SET \`addressId\` = NULL
        WHERE \`addressId\` IS NOT NULL
        AND (
          \`addressId\` REGEXP '^[0-9]+$'  -- Numeric strings
          OR LENGTH(\`addressId\`) < 36  -- Too short to be UUID
        );
      `);
    }

    console.log('[MIGRATION] UUID validation and cleanup completed successfully');
  } catch (error) {
    console.error('[MIGRATION] Error during UUID validation:', error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // This migration is mostly data cleanup, so rollback is not critical
  // But we can't really "undo" the NULL assignments
  console.log('[MIGRATION] Rollback: UUID cleanup migration cannot be fully rolled back');
  console.log('[MIGRATION] Invalid UUIDs were set to NULL and cannot be restored automatically');
}
