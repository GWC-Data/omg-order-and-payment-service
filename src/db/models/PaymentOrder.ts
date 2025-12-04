import {
  Table,
  Column,
  Model,
  DataType,
  Index
} from 'sequelize-typescript';

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'paid'
  | 'captured'
  | 'failed'
  | 'refunded';

@Table({ tableName: 'PaymentOrders', timestamps: true })
export class PaymentOrder extends Model {
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  userId!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  razorpayOrderId!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  razorpayPaymentId?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  razorpaySignature?: string;

  @Column({
    type: DataType.ENUM(
      'created',
      'authorized',
      'paid',
      'captured',
      'failed',
      'refunded'
    ),
    allowNull: false,
    defaultValue: 'created'
  })
  status!: PaymentStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  amount!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'INR'
  })
  currency!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  receipt?: string;

  @Column({
    type: DataType.JSON,
    allowNull: true
  })
  notes?: Record<string, unknown>;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  customerEmail?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  customerPhone?: string;

  @Column({
    type: DataType.JSON,
    allowNull: true
  })
  metadata?: Record<string, unknown>;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  capturedAt?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  expiresAt?: Date;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  failureReason?: string;
}

