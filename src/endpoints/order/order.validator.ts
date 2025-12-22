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
  addressId: {
    in: 'body',
    optional: true,
    isUUID: { errorMessage: 'addressId must be a valid UUID' }
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
  scheduledDate: {
    in: 'body',
    optional: true,
    isISO8601: { errorMessage: 'scheduledDate must be a valid ISO8601 date (YYYY-MM-DD)' }
  },
  scheduledTimestamp: {
    in: 'body',
    optional: true,
    isISO8601: { errorMessage: 'scheduledTimestamp must be a valid ISO8601 date-time' }
  },
  fulfillmentType: {
    in: 'body',
    optional: true,
    isIn: { options: [['pickup', 'delivery', 'in_person', 'digital']], errorMessage: 'Invalid fulfillment type' }
  },
  subtotal: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'subtotal must be a number' } },
  discountAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'discountAmount must be a number' } },
  convenienceFee: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'convenienceFee must be a number' } },
  taxAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'taxAmount must be a number' } },
  totalAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'totalAmount must be a number' } },
  currency: { in: 'body', optional: true, isString: { errorMessage: 'currency must be a string' } },
  paymentStatus: {
    in: 'body',
    optional: true,
    isIn: { options: [['pending', 'paid', 'failed', 'refunded']], errorMessage: 'Invalid payment status' }
  },
  paymentMethod: { in: 'body', optional: true, isString: { errorMessage: 'paymentMethod must be a string' } },
  paymentId: { in: 'body', optional: true, isUUID: { errorMessage: 'Payment ID must be a valid UUID' } },
  paidAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'paidAt must be a valid ISO8601 date-time' } },
  trackingNumber: { in: 'body', optional: true, isString: { errorMessage: 'trackingNumber must be a string' } },
  carrier: { in: 'body', optional: true, isString: { errorMessage: 'carrier must be a string' } },
  shippedAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'shippedAt must be a valid ISO8601 date-time' } },
  deliveredAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'deliveredAt must be a valid ISO8601 date-time' } },
  contactName: { in: 'body', optional: true, isString: { errorMessage: 'contactName must be a string' } },
  contactPhone: { in: 'body', optional: true, isString: { errorMessage: 'contactPhone must be a string' } },
  contactEmail: { in: 'body', optional: true, isEmail: { errorMessage: 'contactEmail must be a valid email address' } },
  cancelledAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'cancelledAt must be a valid ISO8601 date-time' } },
  cancellationReason: { in: 'body', optional: true, isString: { errorMessage: 'cancellationReason must be a string' } },
  refundAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'refundAmount must be a number' } }
};

export const updateOrderValidator: Schema = {
  addressId: {
    in: 'body',
    optional: true,
    isUUID: { errorMessage: 'addressId must be a valid UUID' }
  },
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
  scheduledDate: {
    in: 'body',
    optional: true,
    isISO8601: { errorMessage: 'scheduledDate must be a valid ISO8601 date (YYYY-MM-DD)' }
  },
  scheduledTimestamp: {
    in: 'body',
    optional: true,
    isISO8601: { errorMessage: 'scheduledTimestamp must be a valid ISO8601 date-time' }
  },
  fulfillmentType: {
    in: 'body',
    optional: true,
    isIn: { options: [['pickup', 'delivery', 'in_person', 'digital']], errorMessage: 'Invalid fulfillment type' }
  },
  subtotal: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'subtotal must be a number' } },
  discountAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'discountAmount must be a number' } },
  convenienceFee: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'convenienceFee must be a number' } },
  taxAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'taxAmount must be a number' } },
  totalAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'totalAmount must be a number' } },
  currency: { in: 'body', optional: true, isString: { errorMessage: 'currency must be a string' } },
  paymentStatus: {
    in: 'body',
    optional: true,
    isIn: { options: [['pending', 'paid', 'failed', 'refunded']], errorMessage: 'Invalid payment status' }
  },
  paymentMethod: { in: 'body', optional: true, isString: { errorMessage: 'paymentMethod must be a string' } },
  paymentId: { in: 'body', optional: true, isUUID: { errorMessage: 'Payment ID must be a valid UUID' } },
  paidAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'paidAt must be a valid ISO8601 date-time' } },
  trackingNumber: { in: 'body', optional: true, isString: { errorMessage: 'trackingNumber must be a string' } },
  carrier: { in: 'body', optional: true, isString: { errorMessage: 'carrier must be a string' } },
  shippedAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'shippedAt must be a valid ISO8601 date-time' } },
  deliveredAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'deliveredAt must be a valid ISO8601 date-time' } },
  contactName: { in: 'body', optional: true, isString: { errorMessage: 'contactName must be a string' } },
  contactPhone: { in: 'body', optional: true, isString: { errorMessage: 'contactPhone must be a string' } },
  contactEmail: { in: 'body', optional: true, isEmail: { errorMessage: 'contactEmail must be a valid email address' } },
  cancelledAt: { in: 'body', optional: true, isISO8601: { errorMessage: 'cancelledAt must be a valid ISO8601 date-time' } },
  cancellationReason: { in: 'body', optional: true, isString: { errorMessage: 'cancellationReason must be a string' } },
  refundAmount: { in: 'body', optional: true, toFloat: true, isFloat: { errorMessage: 'refundAmount must be a number' } }
};


