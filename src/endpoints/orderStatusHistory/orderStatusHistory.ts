import { Endpoint, EndpointMethod, EndpointAuthType } from 'node-server-engine';

import {
  createOrderStatusHistoryHandler,
  deleteOrderStatusHistoryHandler,
  getAllOrderStatusHistoryHandler,
  getOrderStatusHistoryByIdHandler
} from './orderStatusHistory.handler';

import {
  createOrderStatusHistoryValidator,
  getOrderStatusHistoryByIdValidator
} from './orderStatusHistory.validator';

export const createOrderStatusHistoryEndpoint = new Endpoint({
  path: '/orders/:orderId/status-history',
  method: EndpointMethod.POST,
  handler: createOrderStatusHistoryHandler,
  authType: EndpointAuthType.JWT,
  validator: createOrderStatusHistoryValidator
});

export const getAllOrderStatusHistoryEndpoint = new Endpoint({
  path: '/orders/:orderId/status-history',
  method: EndpointMethod.GET,
  handler: getAllOrderStatusHistoryHandler,
  authType: EndpointAuthType.JWT,
  validator: {}
});

export const getOrderStatusHistoryByIdEndpoint = new Endpoint({
  path: '/orders/:orderId/status-history/:id',
  method: EndpointMethod.GET,
  handler: getOrderStatusHistoryByIdHandler,
  authType: EndpointAuthType.JWT,
  validator: getOrderStatusHistoryByIdValidator
});

export const deleteOrderStatusHistoryEndpoint = new Endpoint({
  path: '/orders/:orderId/status-history/:id',
  method: EndpointMethod.DELETE,
  handler: deleteOrderStatusHistoryHandler,
  authType: EndpointAuthType.JWT,
  validator: getOrderStatusHistoryByIdValidator
});


