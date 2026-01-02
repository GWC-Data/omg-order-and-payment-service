import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType,
  reportError
} from 'node-server-engine';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { OrderStatusHistory } from 'db/models';
import { sendErrorResponse, sendSuccessResponse } from 'utils/responseUtils';
import {
  ORDER_STATUS_HISTORY_CREATED_SUCCESS,
  ORDER_STATUS_HISTORY_CREATE_ERROR,
  ORDER_STATUS_HISTORY_DELETED_SUCCESS,
  ORDER_STATUS_HISTORY_DELETE_ERROR,
  ORDER_STATUS_HISTORY_FETCH_ERROR,
  ORDER_STATUS_HISTORY_FETCH_SUCCESS,
  ORDER_STATUS_HISTORY_LIST_SUCCESS,
  ORDER_STATUS_HISTORY_NOT_FOUND
} from './orderStatusHistory.const';

/**
 * Create status history record
 */
export const createOrderStatusHistoryHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const record = await OrderStatusHistory.create({
      // Some environments don't end up with a DB-side UUID default; generate it here to avoid NULL id inserts.
      id: randomUUID(),
      orderId: req.params.orderId,
      status: req.body.status,
      previousStatus: req.body.previousStatus,
      notes: req.body.notes,
      location: req.body.location
    } as any);

    sendSuccessResponse(res, 201, ORDER_STATUS_HISTORY_CREATED_SUCCESS, {
      orderStatusHistory: record
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_STATUS_HISTORY_CREATE_ERROR, error);
  }
};

/**
 * List history records for an order
 */
export const getAllOrderStatusHistoryHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const records = await OrderStatusHistory.findAll({
      where: { orderId: req.params.orderId },
      order: [['createdAt', 'DESC']]
    });

    sendSuccessResponse(res, 200, ORDER_STATUS_HISTORY_LIST_SUCCESS, {
      orderStatusHistory: records
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_STATUS_HISTORY_FETCH_ERROR, error);
  }
};

/**
 * Get a single history record
 */
export const getOrderStatusHistoryByIdHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const record = await OrderStatusHistory.findOne({
      where: { id: req.params.id, orderId: req.params.orderId }
    });

    if (!record) {
      sendErrorResponse(res, 404, ORDER_STATUS_HISTORY_NOT_FOUND);
      return;
    }

    sendSuccessResponse(res, 200, ORDER_STATUS_HISTORY_FETCH_SUCCESS, {
      orderStatusHistory: record
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_STATUS_HISTORY_FETCH_ERROR, error);
  }
};

/**
 * Delete a history record
 */
export const deleteOrderStatusHistoryHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const record = await OrderStatusHistory.findOne({
      where: { id: req.params.id, orderId: req.params.orderId }
    });

    if (!record) {
      sendErrorResponse(res, 404, ORDER_STATUS_HISTORY_NOT_FOUND);
      return;
    }

    await record.destroy();
    sendSuccessResponse(res, 200, ORDER_STATUS_HISTORY_DELETED_SUCCESS, {});
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_STATUS_HISTORY_DELETE_ERROR, error);
  }
};


