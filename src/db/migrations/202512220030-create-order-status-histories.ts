import { QueryInterface, DataTypes } from 'sequelize';

async function setTimestampDefaults(
  queryInterface: QueryInterface,
  tableName: string
): Promise<void> {
  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();
  if (dialect === 'mysql') {
    await queryInterface.sequelize.query(`
      ALTER TABLE ${tableName}
      MODIFY createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      MODIFY updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL;
    `);
  } else if (dialect === 'postgres') {
    await queryInterface.sequelize.query(`
      ALTER TABLE "${tableName}"
      ALTER COLUMN "createdAt" SET DEFAULT NOW(),
      ALTER COLUMN "updatedAt" SET DEFAULT NOW();
    `);
  } else if (dialect === 'mssql') {
    await queryInterface.sequelize.query(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT DF_${tableName}_createdAt DEFAULT GETDATE() FOR createdAt;
      ALTER TABLE ${tableName}
      ADD CONSTRAINT DF_${tableName}_updatedAt DEFAULT GETDATE() FOR updatedAt;
    `);
  }
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tableName = 'OrderStatusHistories';
  const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();

  if (tables.includes(tableName)) {
    console.log(`Table ${tableName} already exists, skipping...`);
    return;
  }

  await queryInterface.createTable(tableName, {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false
    },
    previousStatus: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });

  // Indexes (best effort)
  for (const col of ['orderId', 'status', 'previousStatus']) {
    try {
      await queryInterface.addIndex(tableName, [col]);
    } catch {
      // ignore
    }
  }

  await setTimestampDefaults(queryInterface, tableName);
  console.log(`Created table ${tableName} successfully`);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('OrderStatusHistories');
}


