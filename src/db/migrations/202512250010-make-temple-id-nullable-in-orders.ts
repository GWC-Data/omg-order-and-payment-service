import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tableName = 'Orders';
  const columnName = 'templeId';

  try {
    // Check if table exists
    const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();
    if (!tables.includes(tableName)) {
      console.log(`Table ${tableName} does not exist, skipping migration...`);
      return;
    }

    // Check if column exists and is currently NOT NULL
    const tableDescription = await queryInterface.describeTable(tableName);
    if (!tableDescription[columnName]) {
      console.log(`Column ${columnName} does not exist in ${tableName}, skipping migration...`);
      return;
    }

    const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

    if (dialect === 'postgres') {
      // PostgreSQL: Alter column to allow NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE "${tableName}"
        ALTER COLUMN "${columnName}" DROP NOT NULL;
      `);
      console.log(`Made ${columnName} nullable in ${tableName} (PostgreSQL)`);
    } else if (dialect === 'mysql') {
      // MySQL: Modify column to allow NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\`
        MODIFY COLUMN \`${columnName}\` ${DataTypes.UUID} NULL;
      `);
      console.log(`Made ${columnName} nullable in ${tableName} (MySQL)`);
    } else if (dialect === 'mssql') {
      // SQL Server: Alter column to allow NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE ${tableName}
        ALTER COLUMN ${columnName} ${DataTypes.UUID} NULL;
      `);
      console.log(`Made ${columnName} nullable in ${tableName} (SQL Server)`);
    } else {
      // Generic approach using Sequelize
      await queryInterface.changeColumn(tableName, columnName, {
        type: DataTypes.UUID,
        allowNull: true
      });
      console.log(`Made ${columnName} nullable in ${tableName} (Generic)`);
    }

    console.log(`Migration completed: ${columnName} is now nullable in ${tableName}`);
  } catch (error) {
    console.error(`Error making ${columnName} nullable:`, error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tableName = 'Orders';
  const columnName = 'templeId';

  try {
    const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();
    if (!tables.includes(tableName)) {
      console.log(`Table ${tableName} does not exist, skipping rollback...`);
      return;
    }

    const tableDescription = await queryInterface.describeTable(tableName);
    if (!tableDescription[columnName]) {
      console.log(`Column ${columnName} does not exist in ${tableName}, skipping rollback...`);
      return;
    }

    const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();

    if (dialect === 'postgres') {
      // PostgreSQL: Set column to NOT NULL (will fail if NULL values exist)
      await queryInterface.sequelize.query(`
        ALTER TABLE "${tableName}"
        ALTER COLUMN "${columnName}" SET NOT NULL;
      `);
      console.log(`Made ${columnName} NOT NULL in ${tableName} (PostgreSQL)`);
    } else if (dialect === 'mysql') {
      // MySQL: Modify column to NOT NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\`
        MODIFY COLUMN \`${columnName}\` ${DataTypes.UUID} NOT NULL;
      `);
      console.log(`Made ${columnName} NOT NULL in ${tableName} (MySQL)`);
    } else if (dialect === 'mssql') {
      // SQL Server: Alter column to NOT NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE ${tableName}
        ALTER COLUMN ${columnName} ${DataTypes.UUID} NOT NULL;
      `);
      console.log(`Made ${columnName} NOT NULL in ${tableName} (SQL Server)`);
    } else {
      // Generic approach using Sequelize
      await queryInterface.changeColumn(tableName, columnName, {
        type: DataTypes.UUID,
        allowNull: false
      });
      console.log(`Made ${columnName} NOT NULL in ${tableName} (Generic)`);
    }

    console.log(`Rollback completed: ${columnName} is now NOT NULL in ${tableName}`);
  } catch (error) {
    console.error(`Error making ${columnName} NOT NULL:`, error);
    // Note: Rollback may fail if there are NULL values in the column
    throw error;
  }
}

