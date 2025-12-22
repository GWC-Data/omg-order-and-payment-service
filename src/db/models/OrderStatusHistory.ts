import { Table, Column, Model, DataType, Index } from 'sequelize-typescript';

@Table({ tableName: 'OrderStatusHistories', timestamps: true })
export class OrderStatusHistory extends Model {

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


