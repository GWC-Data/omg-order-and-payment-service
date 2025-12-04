import {
  Endpoint,
  EndpointAuthType,
  EndpointMethod,
  middleware
} from 'node-server-engine';
import {
  createPaymentOrderHandler,
  capturePaymentHandler,
  getPaymentOrderHandler,
  listPaymentOrdersHandler,
  verifyPaymentSignatureHandler,
  razorpayWebhookHandler
} from './payments.handler';
import {
  capturePaymentValidator,
  createPaymentOrderValidator,
  getPaymentOrderValidator,
  listPaymentOrdersValidator,
  verifyPaymentValidator,
  razorpayWebhookValidator
} from './payments.validator';

export const createPaymentOrderEndpoint = new Endpoint({
  path: '/payments/orders',
  method: EndpointMethod.POST,
  handler: createPaymentOrderHandler,
  authType: EndpointAuthType.NONE,
  validator: createPaymentOrderValidator,
  middleware: []
});

export const listPaymentOrdersEndpoint = new Endpoint({
  path: '/payments/orders',
  method: EndpointMethod.GET,
  handler: listPaymentOrdersHandler,
  authType: EndpointAuthType.NONE,
  validator: listPaymentOrdersValidator,
  middleware: []
});

export const getPaymentOrderEndpoint = new Endpoint({
  path: '/payments/orders/:orderId',
  method: EndpointMethod.GET,
  handler: getPaymentOrderHandler,
  authType: EndpointAuthType.NONE,
  validator: getPaymentOrderValidator,
  middleware: []
});

export const verifyPaymentSignatureEndpoint = new Endpoint({
  path: '/payments/verify',
  method: EndpointMethod.POST,
  handler: verifyPaymentSignatureHandler,
  authType: EndpointAuthType.NONE,
  validator: verifyPaymentValidator,
  middleware: []
});

export const capturePaymentEndpoint = new Endpoint({
  path: '/payments/capture',
  method: EndpointMethod.POST,
  handler: capturePaymentHandler,
  authType: EndpointAuthType.NONE,
  validator: capturePaymentValidator,
  middleware: []
});

export const razorpayWebhookEndpoint = new Endpoint({
  path: '/payments/webhook/razorpay',
  method: EndpointMethod.POST,
  handler: razorpayWebhookHandler,
  authType: EndpointAuthType.NONE,
  validator: razorpayWebhookValidator,
  middleware: []
});



