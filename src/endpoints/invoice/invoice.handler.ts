/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType,
  reportError
} from 'node-server-engine';
import { Response } from 'express';
import { Order, OrderItem } from 'db/models';
import { sendErrorResponse } from 'utils/responseUtils';
import { writeOrderInvoicePdf } from 'utils/invoicePdf';
import {
  FORBIDDEN,
  INVOICE_DOWNLOAD_ERROR,
  ORDER_NOT_FOUND,
  UNAUTHORIZED
} from './invoice.const';

function isAdmin(req: EndpointRequestType[EndpointAuthType.NONE]): boolean {
  const role = String(((req as any).user as any)?.role ?? '').toLowerCase();
  return role === 'admin' || role === 'superadmin';
}

function getAuthUserId(req: EndpointRequestType[EndpointAuthType.NONE]): string | null {
  const id = ((req as any).user as any)?.id;
  if (id === null || id === undefined) return null;
  return String(id);
}

export const downloadOrderInvoiceHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    /**
     * NOTE (temporary):
     * You asked to keep the 401 logic but not block invoice download right now.
     * Toggle `INVOICE_REQUIRE_AUTH=true` to enforce JWT again.
     */
    const enforceAuth = process.env.INVOICE_REQUIRE_AUTH?.toLowerCase() === 'true';

    const userId = getAuthUserId(req);
    if (!userId) {
      // Keep 401 code path for later, but don't block while authType is NONE.
      if (enforceAuth) {
        sendErrorResponse(res, 401, UNAUTHORIZED);
        return;
      }
    }

    const orderId = String((req.params as any).orderId);
    const orderInstance = await Order.findByPk(orderId);
    if (!orderInstance) {
      sendErrorResponse(res, 404, ORDER_NOT_FOUND);
      return;
    }

    const order = (orderInstance as any).toJSON
      ? (orderInstance as any).toJSON()
      : (orderInstance as any);

    // Access control (only when auth is enforced):
    // - admin can download any
    // - normal user must own the order
    if (enforceAuth) {
      if (!isAdmin(req) && String(order.userId) !== userId) {
        sendErrorResponse(res, 403, FORBIDDEN);
        return;
      }
    }

    const items = await OrderItem.findAll({
      where: { orderId },
      order: [['createdAt', 'ASC']]
    });
    const itemsJson = items.map((i: any) => (i.toJSON ? i.toJSON() : i));

    // 1 invoice per order (stable invoice number derived from orderNumber/id)
    const invoiceNumber = `INV-${String(order.orderNumber ?? order.id ?? orderId)}`;
    const issuedAt = new Date(order.createdAt ?? Date.now());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);

    writeOrderInvoicePdf(res, {
      invoiceNumber,
      issuedAt,
      order,
      items: itemsJson
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, INVOICE_DOWNLOAD_ERROR, error);
  }
};


