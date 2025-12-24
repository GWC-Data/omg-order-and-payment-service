import { Schema } from 'express-validator';

export const orderInvoiceParamsValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'Order ID is required' },
    isUUID: { errorMessage: 'Order ID must be a valid UUID' }
  }
};


