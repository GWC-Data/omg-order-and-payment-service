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
  const tableExists = await queryInterface.sequelize.getQueryInterface().showAllTables();
  const tableName = 'Orders';

  if (tableExists.includes(tableName)) {
    console.log(`Table ${tableName} already exists, skipping...`);
    return;
  }

  await queryInterface.createTable(tableName, {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderNumber: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      unique: true
    },
    userId: { type: DataTypes.UUID, allowNull: false },
    templeId: { type: DataTypes.UUID, allowNull: false },
    orderType: {
      type: DataTypes.ENUM('darshan', 'puja', 'prasad', 'product'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'confirmed',
        'processing',
        'ready',
        'shipped',
        'completed',
        'cancelled',
        'refunded'
      ),
      allowNull: false,
      defaultValue: 'pending'
    },
    scheduledDate: { type: DataTypes.DATEONLY, allowNull: true },
    scheduledTimestamp: { type: DataTypes.DATE, allowNull: true },
    fulfillmentType: {
      type: DataTypes.ENUM('pickup', 'delivery', 'in_person', 'digital'),
      allowNull: true
    },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    convenienceFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    taxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    currency: { type: DataTypes.STRING(10), allowNull: true },
    paymentStatus: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    paymentMethod: { type: DataTypes.STRING, allowNull: true },
    paymentId: { type: DataTypes.UUID, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    trackingNumber: { type: DataTypes.STRING, allowNull: true },
    carrier: { type: DataTypes.STRING, allowNull: true },
    shippedAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    contactName: { type: DataTypes.STRING, allowNull: true },
    contactPhone: { type: DataTypes.STRING, allowNull: true },
    contactEmail: { type: DataTypes.STRING, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancellationReason: { type: DataTypes.TEXT, allowNull: true },
    refundAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });

  // Indexes (best effort)
  for (const col of ['userId', 'templeId', 'status', 'orderType', 'paymentStatus']) {
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
  await queryInterface.dropTable('Orders');
}


