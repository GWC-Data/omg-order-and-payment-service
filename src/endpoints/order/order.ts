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
  authType: EndpointAuthType.JWT,
  validator: createOrderValidator
});

export const getAllOrdersEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.GET,
  handler: getAllOrdersHandler,
  authType: EndpointAuthType.JWT,
  validator: {}
});

export const getOrderByIdEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.GET,
  handler: getOrderByIdHandler,
  authType: EndpointAuthType.JWT,
  validator: {}
});

export const updateOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: updateOrderValidator
});

export const deleteOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: {}
});


