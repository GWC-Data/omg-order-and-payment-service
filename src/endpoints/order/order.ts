import { Endpoint, EndpointMethod, EndpointAuthType, middleware } from 'node-server-engine';

import {
  createOrderHandler,
  deleteOrderHandler,
  getAllOrdersHandler,
  getOrderDetailsHandler,
  getOrderByIdHandler,
  getOrdersByUserIdHandler,
  updateOrderHandler
} from './order.handler';

import { createOrderValidator, getOrderDetailsValidator, getOrdersByUserIdValidator, updateOrderValidator } from './order.validator';

export const createOrderEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.POST,
  handler: createOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: createOrderValidator,
  // middleware: [middleware.checkPermission('CreateOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const getAllOrdersEndpoint = new Endpoint({
  path: '/orders',
  method: EndpointMethod.GET,
  handler: getAllOrdersHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  // middleware: [middleware.checkPermission('GetOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const getOrderByIdEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.GET,
  handler: getOrderByIdHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  // middleware: [middleware.checkPermission('GetOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const getOrdersByUserIdEndpoint = new Endpoint({
  path: '/orders/user/:userId',
  method: EndpointMethod.GET,
  handler: getOrdersByUserIdHandler,
  authType: EndpointAuthType.JWT,
  validator: getOrdersByUserIdValidator,
  // middleware: [middleware.checkPermission('GetOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const getOrderDetailsEndpoint = new Endpoint({
  path: '/orders/:orderId/details',
  method: EndpointMethod.GET,
  handler: getOrderDetailsHandler,
  authType: EndpointAuthType.JWT,
  validator: getOrderDetailsValidator,
  // middleware: [middleware.checkPermission('GetOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const updateOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.PUT,
  handler: updateOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: updateOrderValidator,
  // middleware: [middleware.checkPermission('UpdateOrder')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const deleteOrderEndpoint = new Endpoint({
  path: '/orders/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: {},
  // middleware: [middleware.checkPermission('DeleteOrder')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});


