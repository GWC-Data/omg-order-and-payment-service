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
  // Check if table already exists
  const tableExists = await queryInterface.sequelize.getQueryInterface().showAllTables();
  const tableName = 'PaymentOrders';

  if (!tableExists.includes(tableName)) {
    await queryInterface.createTable('PaymentOrders', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      razorpayOrderId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      razorpayPaymentId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      razorpaySignature: {
        type: DataTypes.STRING,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM(
          'created',
          'authorized',
          'paid',
          'captured',
          'failed',
          'refunded'
        ),
        allowNull: false,
        defaultValue: 'created'
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'INR'
      },
      receipt: {
        type: DataTypes.STRING,
        allowNull: true
      },
      notes: {
        type: DataTypes.JSON,
        allowNull: true
      },
      customerEmail: {
        type: DataTypes.STRING,
        allowNull: true
      },
      customerPhone: {
        type: DataTypes.STRING,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      },
      capturedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      failureReason: {
        type: DataTypes.STRING,
        allowNull: true
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

    // Add index for userId (unique constraints on razorpayOrderId and razorpayPaymentId create implicit indexes)
    try {
      await queryInterface.addIndex('PaymentOrders', ['userId']);
    } catch (error) {
      // Indexes might already exist, ignore
      console.log('userId index may already exist, skipping...');
    }

    await setTimestampDefaults(queryInterface, 'PaymentOrders');
    console.log(`Created table ${tableName} successfully`);
  } else {
    console.log(`Table ${tableName} already exists, checking for missing columns...`);

    // Check if userId column exists and add it if missing
    const tableDescription = await queryInterface.describeTable('PaymentOrders');

    if (!tableDescription.userId) {
      console.log('Adding missing userId column...');
      await queryInterface.addColumn('PaymentOrders', 'userId', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: ''
      });

      try {
        await queryInterface.addIndex('PaymentOrders', ['userId']);
        console.log('Added userId index');
      } catch (error) {
        console.log('userId index may already exist, skipping...');
      }
    } else {
      console.log('userId column already exists');
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('PaymentOrders');
}