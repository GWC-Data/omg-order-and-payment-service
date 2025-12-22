import { Endpoint, EndpointMethod, EndpointAuthType } from 'node-server-engine';

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
  authType: EndpointAuthType.NONE,
  validator: createOrderItemValidator
});

export const getAllOrderItemsEndpoint = new Endpoint({
  path: '/orders/:orderId/items',
  method: EndpointMethod.GET,
  handler: getAllOrderItemsHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});

export const getOrderItemByIdEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.GET,
  handler: getOrderItemByIdHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});

export const updateOrderItemEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderItemHandler,
  authType: EndpointAuthType.NONE,
  validator: updateOrderItemValidator
});

export const deleteOrderItemEndpoint = new Endpoint({
  path: '/orders/:orderId/items/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderItemHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});


