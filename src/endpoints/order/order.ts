import { Endpoint, EndpointMethod, EndpointAuthType } from 'node-server-engine';

import {
  createOrderHandler,
  deleteOrderHandler,
  getAllOrdersHandler,
  getOrderByIdHandler,
  updateOrderHandler
} from './order.handler';

import { createOrderValidator, updateOrderValidator } from './order.validator';

export const createOrderEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.POST,
  handler: createOrderHandler,
  authType: EndpointAuthType.NONE,
  validator: createOrderValidator
});

export const getAllOrdersEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.GET,
  handler: getAllOrdersHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});

export const getOrderByIdEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.GET,
  handler: getOrderByIdHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});

export const updateOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderHandler,
  authType: EndpointAuthType.NONE,
  validator: updateOrderValidator
});

export const deleteOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderHandler,
  authType: EndpointAuthType.NONE,
  validator: {}
});


