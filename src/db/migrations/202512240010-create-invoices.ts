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
  const tableName = 'Invoices';

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
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR'
    },
    issuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    pdfUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'issued', 'paid', 'cancelled'),
      allowNull: false,
      defaultValue: 'issued'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Indexes (best effort)
  for (const col of ['invoiceNumber', 'orderId', 'userId', 'status']) {
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
  await queryInterface.dropTable('Invoices');
}
