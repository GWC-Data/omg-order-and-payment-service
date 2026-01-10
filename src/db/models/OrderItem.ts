import { Table, Column, Model, DataType, Index, PrimaryKey, Default } from 'sequelize-typescript';

@Table({ tableName: 'OrderItems', timestamps: true })
export class OrderItem extends Model {

  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({
    type: DataType.UUID,
    allowNull: false
  })
  id!: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  orderId!: string;

  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  itemType!: string;

  @Column({ type: DataType.UUID, allowNull: true })
  itemId?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  itemName?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  itemDescription?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  itemImageUrl?: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  productId?: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  pujaId?: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  prasadId?: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  dharshanId?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  quantity?: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  unitPrice?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  totalPrice?: string;

  @Column({ type: DataType.JSON, allowNull: true })
  itemDetails?: Record<string, unknown>;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  status?: string;
}


