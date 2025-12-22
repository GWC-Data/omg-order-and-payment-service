import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // If table doesn't exist, skip (it will be created by the create-orders migration)
  const tables = await queryInterface.sequelize.getQueryInterface().showAllTables();
  if (!tables.includes('Orders')) return;

  const columns = await queryInterface.describeTable('Orders');
  if ((columns as any).addressId) return;

  await queryInterface.addColumn('Orders', 'addressId', {
    type: DataTypes.UUID,
    allowNull: true
  });

  // Index (best effort)
  try {
    await queryInterface.addIndex('Orders', ['addressId']);
  } catch {
    // ignore
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  try {
    await queryInterface.removeColumn('Orders', 'addressId');
  } catch {
    // ignore
  }
}


