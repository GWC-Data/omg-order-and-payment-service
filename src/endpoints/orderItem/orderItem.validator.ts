import { Schema } from 'express-validator';

export const createOrderItemValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'Order ID is required' },
    isUUID: { errorMessage: 'Order ID must be a valid UUID' }
  },
  itemType: {
    in: 'body',
    exists: { errorMessage: 'Item type is required' },
    isString: true
  },
  itemId: { in: 'body', optional: true, isUUID: { errorMessage: 'Item ID must be a valid UUID' } },
  itemName: { in: 'body', optional: true, isString: true },
  itemDescription: { in: 'body', optional: true, isString: true },
  itemImageUrl: { in: 'body', optional: true, isString: true },
  productId: { in: 'body', optional: true, isUUID: { errorMessage: 'Product ID must be a valid UUID' } },
  pujaId: { in: 'body', optional: true, isUUID: { errorMessage: 'Puja ID must be a valid UUID' } },
  prasadId: { in: 'body', optional: true, isUUID: { errorMessage: 'Prasad ID must be a valid UUID' } },
  dharshanId: { in: 'body', optional: true, isUUID: { errorMessage: 'Dharshan ID must be a valid UUID' } },
  quantity: { in: 'body', optional: true, toInt: true, isInt: { options: { min: 1 } } },
  unitPrice: { in: 'body', optional: true, toFloat: true, isFloat: { options: { min: 0 } } },
  totalPrice: { in: 'body', optional: true, toFloat: true, isFloat: { options: { min: 0 } } },
  itemDetails: { in: 'body', optional: true, isObject: { errorMessage: 'itemDetails must be an object' } },
  status: { in: 'body', optional: true, isString: true }
};

export const updateOrderItemValidator: Schema = {
  orderId: {
    in: 'params',
    exists: { errorMessage: 'Order ID is required' },
    isUUID: { errorMessage: 'Order ID must be a valid UUID' }
  },
  id: {
    in: 'params',
    exists: { errorMessage: 'Order item ID is required' },
    isUUID: { errorMessage: 'Order item ID must be a valid UUID' }
  },
  itemType: { in: 'body', optional: true, isString: true },
  itemId: { in: 'body', optional: true, isUUID: { errorMessage: 'Item ID must be a valid UUID' } },
  itemName: { in: 'body', optional: true, isString: true },
  itemDescription: { in: 'body', optional: true, isString: true },
  itemImageUrl: { in: 'body', optional: true, isString: true },
  productId: { in: 'body', optional: true, isUUID: { errorMessage: 'Product ID must be a valid UUID' } },
  pujaId: { in: 'body', optional: true, isUUID: { errorMessage: 'Puja ID must be a valid UUID' } },
  prasadId: { in: 'body', optional: true, isUUID: { errorMessage: 'Prasad ID must be a valid UUID' } },
  dharshanId: { in: 'body', optional: true, isUUID: { errorMessage: 'Dharshan ID must be a valid UUID' } },
  quantity: { in: 'body', optional: true, toInt: true, isInt: { options: { min: 1 } } },
  unitPrice: { in: 'body', optional: true, toFloat: true, isFloat: { options: { min: 0 } } },
  totalPrice: { in: 'body', optional: true, toFloat: true, isFloat: { options: { min: 0 } } },
  itemDetails: { in: 'body', optional: true, isObject: { errorMessage: 'itemDetails must be an object' } },
  status: { in: 'body', optional: true, isString: true }
};


