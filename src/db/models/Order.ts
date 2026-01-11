import { Table, Column, Model, DataType, Index, PrimaryKey, Default } from 'sequelize-typescript';

export type OrderType = 'darshan' | 'puja' | 'prasad' | 'product' | 'event';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export type FulfillmentType = 'pickup' | 'delivery' | 'in_person' | 'digital';

export type OrderPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

@Table({ tableName: 'Orders', timestamps: true })
export class Order extends Model {

  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({
    type: DataType.UUID,
    allowNull: false
  })
  id!: string;

  @Index
  @Default(DataType.UUIDV4)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  orderNumber!: string;

  @Index
  @Column({
    type: DataType.UUID,
    allowNull: false
  })
  userId!: string;

  @Index
  @Column({
    type: DataType.UUID,
    allowNull: true
  })
  templeId?: string;

  @Index
  @Column({
    type: DataType.UUID,
    allowNull: true
  })
  addressId?: string;

  @Column({
    type: DataType.ENUM('darshan', 'puja', 'prasad', 'product', 'event'),
    allowNull: false
  })
  orderType!: OrderType;

  @Index
  @Column({
    type: DataType.ENUM(
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
  })
  status!: OrderStatus;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  scheduledDate?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  scheduledTimestamp?: Date;

  @Column({
    type: DataType.ENUM('pickup', 'delivery', 'in_person', 'digital'),
    allowNull: true
  })
  fulfillmentType?: FulfillmentType;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  subtotal?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  discountAmount?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  convenienceFee?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  taxAmount?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  totalAmount?: string;

  @Column({ type: DataType.STRING(10), allowNull: true })
  currency?: string;

  @Column({
    type: DataType.ENUM('pending', 'paid', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  })
  paymentStatus!: OrderPaymentStatus;

  @Column({ type: DataType.STRING, allowNull: true })
  paymentMethod?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  paymentId?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  paidAt?: Date;

  @Column({ type: DataType.STRING, allowNull: true })
  trackingNumber?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  carrier?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  shippedAt?: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  deliveredAt?: Date;

  @Column({ type: DataType.STRING, allowNull: true })
  contactName?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  contactPhone?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  contactEmail?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  cancelledAt?: Date;

  @Column({ type: DataType.TEXT, allowNull: true })
  cancellationReason?: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  refundAmount?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  shippingAddress?: string;

  @Column({
    type: DataType.ENUM('standard', 'express'),
    allowNull: true
  })
  deliveryType?: 'standard' | 'express';
}


