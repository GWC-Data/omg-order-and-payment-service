import { Table, Column, Model, DataType, Index, PrimaryKey, Default } from 'sequelize-typescript';

@Table({ tableName: 'OrderStatusHistories', timestamps: true })
export class OrderStatusHistory extends Model {

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
  status!: string;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  previousStatus?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  notes?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  location?: string;
}


