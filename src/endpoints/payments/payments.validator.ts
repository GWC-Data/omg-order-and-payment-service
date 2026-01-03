import { Schema } from 'express-validator';

const jsonObjectValidator = {
  custom: {
    options: (value: unknown) =>
      value === undefined || typeof value === 'object',
    errorMessage: 'Must be a valid JSON object'
  }
};

export const createPaymentOrderValidator: Schema = {
  userId: {
    in: 'body',
    exists: { errorMessage: 'userId is required' },
    isString: true,
    trim: true
  },
  amount: {
    in: 'body',
    exists: { errorMessage: 'Amount is required' },
    isFloat: { options: { gt: 0 }, errorMessage: 'Amount must be greater than 0' },
    toFloat: true
  },
  currency: {
    in: 'body',
    optional: true,
    isString: true,
    trim: true,
    isLength: {
      options: { min: 3, max: 3 },
      errorMessage: 'Currency must be a 3 letter ISO code'
    }
  },
  receipt: { in: 'body', optional: true, isString: true, trim: true },
  notes: {
    in: 'body',
    optional: true,
    ...jsonObjectValidator
  },
  metadata: {
    in: 'body',
    optional: true,
    ...jsonObjectValidator
  },
  customerEmail: { in: 'body', optional: true, isEmail: true, normalizeEmail: true },
  customerPhone: { in: 'body', optional: true, isString: true, trim: true },
  autoCapture: { in: 'body', optional: true, isBoolean: true, toBoolean: true }
};

export const verifyPaymentValidator: Schema = {
  razorpay_order_id: {
    in: 'body',
    exists: { errorMessage: 'razorpay_order_id is required' },
    isString: true
  },
  razorpay_payment_id: {
    in: 'body',
    exists: { errorMessage: 'razorpay_payment_id is required' },
    isString: true
  },
  razorpay_signature: {
    in: 'body',
    exists: { errorMessage: 'razorpay_signature is required' },
    isString: true
  },

  // Order create fields (required)
  userId: {
    in: 'body',
    exists: { errorMessage: 'User ID is required' },
    isUUID: { errorMessage: 'User ID must be a valid UUID' }
  },
  templeId: {
    in: 'body',
    optional: true,
    // exists: { errorMessage: 'Temple ID is required' },
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

  // Optional order fields
  addressId: { in: 'body', optional: true, isUUID: { errorMessage: 'addressId must be a valid UUID' } },
  status: {
    in: 'body',
    optional: true,
    isIn: {
      options: [['pending', 'confirmed', 'processing', 'ready', 'shipped', 'completed', 'cancelled', 'refunded']],
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
  contactName: { in: 'body', optional: true, isString: { errorMessage: 'contactName must be a string' } },
  contactPhone: { in: 'body', optional: true, isString: { errorMessage: 'contactPhone must be a string' } },
  contactEmail: { in: 'body', optional: true, isEmail: { errorMessage: 'contactEmail must be a valid email address' } },
  orderItems: {
    in: 'body',
    optional: true,
    isArray: { errorMessage: 'orderItems must be an array' },
    custom: {
      options: (value: unknown) => {
        if (value === undefined || value === null) return true;
        if (!Array.isArray(value)) return false;
        // Validate each item in the array
        for (const item of value) {
          if (typeof item !== 'object' || item === null) return false;
          if (!('itemType' in item) || typeof item.itemType !== 'string') return false;
          // Optional fields validation
          if ('itemId' in item && item.itemId !== null && typeof item.itemId !== 'string') return false;
          if ('itemName' in item && item.itemName !== null && typeof item.itemName !== 'string') return false;
          if ('itemDescription' in item && item.itemDescription !== null && typeof item.itemDescription !== 'string') return false;
          if ('itemImageUrl' in item && item.itemImageUrl !== null && typeof item.itemImageUrl !== 'string') return false;
          if ('productId' in item && item.productId !== null && typeof item.productId !== 'string') return false;
          if ('pujaId' in item && item.pujaId !== null && typeof item.pujaId !== 'string') return false;
          if ('prasadId' in item && item.prasadId !== null && typeof item.prasadId !== 'string') return false;
          if ('dharshanId' in item && item.dharshanId !== null && typeof item.dharshanId !== 'string') return false;
          if ('quantity' in item && item.quantity !== null && typeof item.quantity !== 'number') return false;
          if ('unitPrice' in item && item.unitPrice !== null && typeof item.unitPrice !== 'number') return false;
          if ('totalPrice' in item && item.totalPrice !== null && typeof item.totalPrice !== 'number') return false;
          if ('itemDetails' in item && item.itemDetails !== null && typeof item.itemDetails !== 'object') return false;
          if ('status' in item && item.status !== null && typeof item.status !== 'string') return false;
        }
        return true;
      },
      errorMessage: 'orderItems must be an array of valid order item objects with required itemType field'
    }
  }
};

export const capturePaymentValidator: Schema = {
  paymentId: {
    in: 'body',
    exists: { errorMessage: 'paymentId is required' },
    isString: true
  },
  amount: {
    in: 'body',
    optional: true,
    isFloat: { options: { gt: 0 }, errorMessage: 'Amount must be greater than 0' },
    toFloat: true
  },
  currency: {
    in: 'body',
    optional: true,
    isString: true,
    trim: true,
    isLength: { options: { min: 3, max: 3 } }
  }
};

export const getPaymentOrderValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'orderId is required' },
    isString: true
  }
};

export const listPaymentOrdersValidator: Schema = {
  userId: {
    in: 'query',
    optional: true,
    isString: true,
    trim: true
  },
  status: {
    in: 'query',
    optional: true,
    isIn: {
      options: [['created', 'authorized', 'paid', 'captured', 'failed', 'refunded']],
      errorMessage: 'Invalid status value'
    }
  },
  page: {
    in: 'query',
    optional: true,
    isInt: { options: { min: 1 } },
    toInt: true
  },
  pageSize: {
    in: 'query',
    optional: true,
    isInt: { options: { min: 1, max: 100 } },
    toInt: true
  }
};

export const razorpayWebhookValidator: Schema = {
  'X-Razorpay-Signature': {
    in: 'headers',
    exists: { errorMessage: 'Razorpay signature header is required' },
    isString: true
  }
};


