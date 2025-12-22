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
  const tableName = 'OrderItems';
  const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();

  if (tables.includes(tableName)) {
    console.log(`Table ${tableName} already exists, skipping...`);
    return;
  }

  const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();
  const jsonType = dialect === 'postgres' ? (DataTypes as any).JSONB ?? DataTypes.JSON : DataTypes.JSON;

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
    itemType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    itemId: { type: DataTypes.UUID, allowNull: true },
    itemName: { type: DataTypes.STRING, allowNull: true },
    itemDescription: { type: DataTypes.TEXT, allowNull: true },
    itemImageUrl: { type: DataTypes.STRING, allowNull: true },
    productId: { type: DataTypes.UUID, allowNull: true },
    pujaId: { type: DataTypes.UUID, allowNull: true },
    prasadId: { type: DataTypes.UUID, allowNull: true },
    dharshanId: { type: DataTypes.UUID, allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: true },
    unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    totalPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    itemDetails: { type: jsonType, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });

  // Indexes (best effort)
  for (const col of [
    'orderId',
    'itemType',
    'productId',
    'pujaId',
    'prasadId',
    'dharshanId',
    'status'
  ]) {
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
  await queryInterface.dropTable('OrderItems');
}


