import { Endpoint, EndpointAuthType, EndpointMethod, middleware } from 'node-server-engine';
import { downloadOrderInvoiceHandler } from './invoice.handler';
import { orderInvoiceParamsValidator } from './invoice.validator';

export const downloadOrderInvoiceEndpoint = new Endpoint({
  path: '/orders/:orderId/invoice',
  method: EndpointMethod.GET,
  handler: downloadOrderInvoiceHandler,
  authType: EndpointAuthType.JWT,
  validator: orderInvoiceParamsValidator,
  middleware: [middleware.checkPermission('DownloadInvoice')]
});


