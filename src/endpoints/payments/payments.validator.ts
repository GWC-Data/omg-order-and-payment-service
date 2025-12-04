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


