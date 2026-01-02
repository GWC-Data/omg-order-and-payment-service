import { Endpoint, EndpointMethod, EndpointAuthType, middleware } from 'node-server-engine';

import {
  createOrderHandler,
  deleteOrderHandler,
  getAllOrdersHandler,
  getOrderDetailsHandler,
  getOrderByIdHandler,
  updateOrderHandler
} from './order.handler';

import { createOrderValidator, getOrderDetailsValidator, updateOrderValidator } from './order.validator';

export const createOrderEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.POST,
  handler: createOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: createOrderValidator,
  middleware: [middleware.checkPermission('CreateOrder')]
});

export const getAllOrdersEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.GET,
  handler: getAllOrdersHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission('GetOrder')]
});

export const getOrderByIdEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.GET,
  handler: getOrderByIdHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission('GetOrder')]
});

export const getOrderDetailsEndpoint = new Endpoint({
  path: '/orders/:orderId/details',
  method: EndpointMethod.GET,
  handler: getOrderDetailsHandler,
  authType: EndpointAuthType.JWT,
  validator: getOrderDetailsValidator,
  middleware: [middleware.checkPermission('GetOrder')]
});

export const updateOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: updateOrderValidator,
  middleware: [middleware.checkPermission('UpdateOrder')]
});

export const deleteOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  middleware: [middleware.checkPermission('DeleteOrder')]
});


