import { Endpoint, EndpointMethod, EndpointAuthType, middleware } from 'node-server-engine';

import {
  createOrderItemHandler,
  deleteOrderItemHandler,
  getAllOrderItemsHandler,
  getOrderItemByIdHandler,
  updateOrderItemHandler
} from './orderItem.handler';

import { createOrderItemValidator, updateOrderItemValidator } from './orderItem.validator';

export const createOrderItemEndpoint = new Endpoint({
  path: '/orders/:orderId/items',
  method: EndpointMethod.POST,
  handler: createOrderItemHandler,
  authType: EndpointAuthType.JWT,
  validator: createOrderItemValidator,
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const getAllOrderItemsEndpoint = new Endpoint({
  path: '/orders/:orderId/items',
  method: EndpointMethod.GET,
  handler: getAllOrderItemsHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const getOrderItemByIdEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.GET,
  handler: getOrderItemByIdHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const updateOrderItemEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderItemHandler,
  authType: EndpointAuthType.JWT,
  validator: updateOrderItemValidator,
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const deleteOrderItemEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderItemHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission(['AdminAccess'])]
});
