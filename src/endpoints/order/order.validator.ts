import { Schema } from 'express-validator';

export const createOrderValidator: Schema = {
  userId: {
    in: 'body',
    exists: { errorMessage: 'User ID is required' },
    isUUID: { errorMessage: 'User ID must be a valid UUID' }
  },
  templeId: {
    in: 'body',
    exists: { errorMessage: 'Temple ID is required' },
    isUUID: { errorMessage: 'Temple ID must be a valid UUID' }
  },
  orderType: {
    in: 'body',
    exists: { errorMessage: 'Order type is required' },
    isIn: {
      options: [['darshan', 'puja', 'prasad', 'product']],
      errorMessage: 'Invalid order type'
    }
  },
  status: {
    in: 'body',
    optional: true,
    isIn: {
      options: [
        ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'completed', 'cancelled', 'refunded']
      ],
      errorMessage: 'Invalid status'
    }
  },
  scheduledDate: { in: 'body', optional: true, isISO8601: true },
  scheduledTimestamp: { in: 'body', optional: true, isISO8601: true },
  fulfillmentType: {
    in: 'body',
    optional: true,
    isIn: { options: [['pickup', 'delivery', 'in_person', 'digital']], errorMessage: 'Invalid fulfillment type' }
  },
  subtotal: { in: 'body', optional: true, toFloat: true, isFloat: true },
  discountAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  convenienceFee: { in: 'body', optional: true, toFloat: true, isFloat: true },
  taxAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  totalAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  currency: { in: 'body', optional: true, isString: true },
  paymentStatus: {
    in: 'body',
    optional: true,
    isIn: { options: [['pending', 'paid', 'failed', 'refunded']], errorMessage: 'Invalid payment status' }
  },
  paymentMethod: { in: 'body', optional: true, isString: true },
  paymentId: { in: 'body', optional: true, isUUID: { errorMessage: 'Payment ID must be a valid UUID' } },
  paidAt: { in: 'body', optional: true, isISO8601: true },
  trackingNumber: { in: 'body', optional: true, isString: true },
  carrier: { in: 'body', optional: true, isString: true },
  shippedAt: { in: 'body', optional: true, isISO8601: true },
  deliveredAt: { in: 'body', optional: true, isISO8601: true },
  contactName: { in: 'body', optional: true, isString: true },
  contactPhone: { in: 'body', optional: true, isString: true },
  contactEmail: { in: 'body', optional: true, isEmail: true },
  cancelledAt: { in: 'body', optional: true, isISO8601: true },
  cancellationReason: { in: 'body', optional: true, isString: true },
  refundAmount: { in: 'body', optional: true, toFloat: true, isFloat: true }
};

export const updateOrderValidator: Schema = {
  orderType: {
    in: 'body',
    optional: true,
    isIn: { options: [['darshan', 'puja', 'prasad', 'product']], errorMessage: 'Invalid order type' }
  },
  status: {
    in: 'body',
    optional: true,
    isIn: {
      options: [
        ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'completed', 'cancelled', 'refunded']
      ],
      errorMessage: 'Invalid status'
    }
  },
  scheduledDate: { in: 'body', optional: true, isISO8601: true },
  scheduledTimestamp: { in: 'body', optional: true, isISO8601: true },
  fulfillmentType: {
    in: 'body',
    optional: true,
    isIn: { options: [['pickup', 'delivery', 'in_person', 'digital']], errorMessage: 'Invalid fulfillment type' }
  },
  subtotal: { in: 'body', optional: true, toFloat: true, isFloat: true },
  discountAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  convenienceFee: { in: 'body', optional: true, toFloat: true, isFloat: true },
  taxAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  totalAmount: { in: 'body', optional: true, toFloat: true, isFloat: true },
  currency: { in: 'body', optional: true, isString: true },
  paymentStatus: {
    in: 'body',
    optional: true,
    isIn: { options: [['pending', 'paid', 'failed', 'refunded']], errorMessage: 'Invalid payment status' }
  },
  paymentMethod: { in: 'body', optional: true, isString: true },
  paymentId: { in: 'body', optional: true, isUUID: { errorMessage: 'Payment ID must be a valid UUID' } },
  paidAt: { in: 'body', optional: true, isISO8601: true },
  trackingNumber: { in: 'body', optional: true, isString: true },
  carrier: { in: 'body', optional: true, isString: true },
  shippedAt: { in: 'body', optional: true, isISO8601: true },
  deliveredAt: { in: 'body', optional: true, isISO8601: true },
  contactName: { in: 'body', optional: true, isString: true },
  contactPhone: { in: 'body', optional: true, isString: true },
  contactEmail: { in: 'body', optional: true, isEmail: true },
  cancelledAt: { in: 'body', optional: true, isISO8601: true },
  cancellationReason: { in: 'body', optional: true, isString: true },
  refundAmount: { in: 'body', optional: true, toFloat: true, isFloat: true }
};


