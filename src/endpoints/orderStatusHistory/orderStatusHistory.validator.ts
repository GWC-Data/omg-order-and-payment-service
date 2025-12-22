import { Schema } from 'express-validator';

export const createOrderStatusHistoryValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'Order ID is required' },
    isUUID: { errorMessage: 'Order ID must be a valid UUID' }
  },
  status: {
    in: 'body',
    exists: { errorMessage: 'Status is required' },
    isString: true
  },
  previousStatus: { in: 'body', optional: true, isString: true },
  notes: { in: 'body', optional: true, isString: true },
  location: { in: 'body', optional: true, isString: true }
};

export const getOrderStatusHistoryByIdValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'Order ID is required' },
    isUUID: { errorMessage: 'Order ID must be a valid UUID' }
  },
  id: {
    in: 'params',
    exists: { errorMessage: 'History ID is required' },
    isUUID: { errorMessage: 'History ID must be a valid UUID' }
  }
};


