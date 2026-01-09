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
  authType: EndpointAuthType.JWT,
  validator: createPaymentOrderValidator,
  // middleware: [middleware.checkPermission('CreatePaymentOrder')]
  middleware: [middleware.checkPermission(['AdminAccess', 'UserAccess'])]
});

export const listPaymentOrdersEndpoint = new Endpoint({
  path: '/payments/orders',
  method: EndpointMethod.GET,
  handler: listPaymentOrdersHandler,
  authType: EndpointAuthType.JWT,
  validator: listPaymentOrdersValidator,
  // middleware: [middleware.checkPermission('GetPaymentOrder')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const getPaymentOrderEndpoint = new Endpoint({
  path: '/payments/orders/:orderId',
  method: EndpointMethod.GET,
  handler: getPaymentOrderHandler,
  authType: EndpointAuthType.JWT,
  validator: getPaymentOrderValidator,
  // middleware: [middleware.checkPermission('GetPaymentOrder')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const verifyPaymentSignatureEndpoint = new Endpoint({
  path: '/payments/verify',
  method: EndpointMethod.POST,
  handler: verifyPaymentSignatureHandler,
  authType: EndpointAuthType.JWT,
  validator: verifyPaymentValidator,
  // middleware: [middleware.checkPermission('VerifyPayment')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const capturePaymentEndpoint = new Endpoint({
  path: '/payments/capture',
  method: EndpointMethod.POST,
  handler: capturePaymentHandler,
  authType: EndpointAuthType.JWT,
  validator: capturePaymentValidator,
  // middleware: [middleware.checkPermission('CapturePayment')]
  middleware: [middleware.checkPermission(['AdminAccess'])]
});

export const razorpayWebhookEndpoint = new Endpoint({
  path: '/payments/webhook/razorpay',
  method: EndpointMethod.POST,
  handler: razorpayWebhookHandler,
  authType: EndpointAuthType.NONE,
  validator: razorpayWebhookValidator,
  middleware: []
});



