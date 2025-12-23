import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType,
  reportError
} from 'node-server-engine';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { OrderItem } from 'db/models';
import { sendErrorResponse, sendSuccessResponse } from 'utils/responseUtils';
import {
  ORDER_ITEM_CREATED_SUCCESS,
  ORDER_ITEM_CREATE_ERROR,
  ORDER_ITEM_DELETED_SUCCESS,
  ORDER_ITEM_DELETE_ERROR,
  ORDER_ITEM_FETCH_ERROR,
  ORDER_ITEM_FETCH_SUCCESS,
  ORDER_ITEM_LIST_SUCCESS,
  ORDER_ITEM_NOT_FOUND,
  ORDER_ITEM_UPDATED_SUCCESS,
  ORDER_ITEM_UPDATE_ERROR
} from './orderItem.const';

/**
 * Create Order Item
 */
export const createOrderItemHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const orderItem = await OrderItem.create({
      // Some environments don't end up with a DB-side UUID default; generate it here to avoid NULL id inserts.
      id: randomUUID(),
      orderId: req.params.orderId,
      itemType: req.body.itemType,
      itemId: req.body.itemId,
      itemName: req.body.itemName,
      itemDescription: req.body.itemDescription,
      itemImageUrl: req.body.itemImageUrl,
      productId: req.body.productId,
      pujaId: req.body.pujaId,
      prasadId: req.body.prasadId,
      dharshanId: req.body.dharshanId,
      quantity: req.body.quantity,
      unitPrice: req.body.unitPrice,
      totalPrice: req.body.totalPrice,
      itemDetails: req.body.itemDetails,
      status: req.body.status
    } as any);

    sendSuccessResponse(res, 201, ORDER_ITEM_CREATED_SUCCESS, { orderItem });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_ITEM_CREATE_ERROR, error);
  }
};

/**
 * List Order Items for an Order
 */
export const getAllOrderItemsHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const orderItems = await OrderItem.findAll({
      where: { orderId: req.params.orderId },
      order: [['createdAt', 'DESC']]
    });

    sendSuccessResponse(res, 200, ORDER_ITEM_LIST_SUCCESS, { orderItems });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_ITEM_FETCH_ERROR, error);
  }
};

/**
 * Get Order Item by Id (scoped to order)
 */
export const getOrderItemByIdHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const orderItem = await OrderItem.findOne({
      where: { id: req.params.id, orderId: req.params.orderId }
    });

    if (!orderItem) {
      sendErrorResponse(res, 404, ORDER_ITEM_NOT_FOUND);
      return;
    }

    sendSuccessResponse(res, 200, ORDER_ITEM_FETCH_SUCCESS, { orderItem });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_ITEM_FETCH_ERROR, error);
  }
};

/**
 * Update Order Item
 */
export const updateOrderItemHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const orderItem = await OrderItem.findOne({
      where: { id: req.params.id, orderId: req.params.orderId }
    });

    if (!orderItem) {
      sendErrorResponse(res, 404, ORDER_ITEM_NOT_FOUND);
      return;
    }

    await orderItem.update({
      itemType: req.body.itemType ?? orderItem.itemType,
      itemId: req.body.itemId ?? orderItem.itemId,
      itemName: req.body.itemName ?? orderItem.itemName,
      itemDescription: req.body.itemDescription ?? orderItem.itemDescription,
      itemImageUrl: req.body.itemImageUrl ?? orderItem.itemImageUrl,
      productId: req.body.productId ?? orderItem.productId,
      pujaId: req.body.pujaId ?? orderItem.pujaId,
      prasadId: req.body.prasadId ?? orderItem.prasadId,
      dharshanId: req.body.dharshanId ?? orderItem.dharshanId,
      quantity: req.body.quantity ?? orderItem.quantity,
      unitPrice: req.body.unitPrice ?? orderItem.unitPrice,
      totalPrice: req.body.totalPrice ?? orderItem.totalPrice,
      itemDetails: req.body.itemDetails ?? orderItem.itemDetails,
      status: req.body.status ?? orderItem.status
    } as any);

    sendSuccessResponse(res, 200, ORDER_ITEM_UPDATED_SUCCESS, { orderItem });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_ITEM_UPDATE_ERROR, error);
  }
};

/**
 * Delete Order Item
 */
export const deleteOrderItemHandler: EndpointHandler<EndpointAuthType.NONE> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const orderItem = await OrderItem.findOne({
      where: { id: req.params.id, orderId: req.params.orderId }
    });

    if (!orderItem) {
      sendErrorResponse(res, 404, ORDER_ITEM_NOT_FOUND);
      return;
    }

    await orderItem.destroy();
    sendSuccessResponse(res, 200, ORDER_ITEM_DELETED_SUCCESS, {});
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_ITEM_DELETE_ERROR, error);
  }
};


