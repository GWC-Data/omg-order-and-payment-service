import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType,
  reportError
} from 'node-server-engine';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { Op, WhereOptions } from 'sequelize';
import { Order, OrderItem, OrderStatusHistory } from 'db/models';
import { sendErrorResponse, sendSuccessResponse } from 'utils/responseUtils';
import {
  ORDER_CREATED_SUCCESS,
  ORDER_CREATE_ERROR,
  ORDER_DELETED_SUCCESS,
  ORDER_DELETE_ERROR,
  ORDER_DETAILS_FETCH_ERROR,
  ORDER_DETAILS_FETCH_SUCCESS,
  ORDER_FETCH_ERROR,
  ORDER_FETCH_SUCCESS,
  ORDER_LIST_SUCCESS,
  ORDER_NOT_FOUND,
  ORDER_UPDATED_SUCCESS,
  ORDER_UPDATE_ERROR
} from './order.const';
import { applyOrderReward } from 'services/rewards/orderReward';
import { enrichOrderWithUserProfile, enrichOrdersWithUserProfiles } from 'services/identityService';

/**
 * Create Order
 */
export const createOrderHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const paymentStatus = req.body.paymentStatus ?? 'pending';
    const order = await Order.create({
      orderNumber: randomUUID(),
      userId: req.body.userId,
      templeId: req.body.templeId,
      addressId: req.body.addressId,
      orderType: req.body.orderType,
      status: req.body.status ?? 'pending',
      scheduledDate: req.body.scheduledDate,
      scheduledTimestamp: req.body.scheduledTimestamp,
      fulfillmentType: req.body.fulfillmentType,
      subtotal: req.body.subtotal,
      discountAmount: req.body.discountAmount,
      convenienceFee: req.body.convenienceFee,
      taxAmount: req.body.taxAmount,
      totalAmount: req.body.totalAmount,
      currency: req.body.currency,
      paymentStatus: req.body.paymentStatus ?? 'pending',
      paymentMethod: req.body.paymentMethod,
      paymentId: req.body.paymentId,
      paidAt: req.body.paidAt,
      trackingNumber: req.body.trackingNumber,
      carrier: req.body.carrier,
      shippedAt: req.body.shippedAt,
      deliveredAt: req.body.deliveredAt,
      contactName: req.body.contactName,
      contactPhone: req.body.contactPhone,
      contactEmail: req.body.contactEmail,
      cancelledAt: req.body.cancelledAt,
      cancellationReason: req.body.cancellationReason,
      refundAmount: req.body.refundAmount,
      shippingAddress: req.body.shippingAddress,
      deliveryType: req.body.deliveryType
    } as any);

    const orderJson = order.toJSON ? order.toJSON() : order;

    try {
      const initialStatus = req.body.status ?? 'pending';
      await OrderStatusHistory.create({
        id: randomUUID(),
        orderId: orderJson.id,
        status: initialStatus,
        previousStatus: null,
        notes: 'Order created',
        location: null
      } as any);
      console.log(`Created initial order status history for order ${orderJson.id} with status: ${initialStatus}`);
    } catch (statusHistoryError) {
      console.error('Error creating order status history:', statusHistoryError);
      reportError(statusHistoryError);
    }

    sendSuccessResponse(res, 201, ORDER_CREATED_SUCCESS, { order: orderJson });

    if (orderJson.orderType && paymentStatus === 'paid') {
      applyOrderReward(
        String(orderJson.userId),
        String(orderJson.id),
        String(orderJson.orderType),
        String(orderJson.orderNumber)
      ).catch(reportError);
    }
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_CREATE_ERROR, error);
  }
};

/**
 * Get Order by Id (with OrderItems and OrderStatusHistory)
 */
export const getOrderByIdHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const orderId = String(req.params.id);
    const order = await Order.findByPk(orderId);
    if (!order) {
      sendErrorResponse(res, 404, ORDER_NOT_FOUND);
      return;
    }

    const [items, statusHistory] = await Promise.all([
      OrderItem.findAll({ where: { orderId }, order: [['createdAt', 'ASC']] }),
      OrderStatusHistory.findAll({
        where: { orderId },
        order: [['createdAt', 'DESC']]
      })
    ]);

    const orderJson = order.toJSON ? order.toJSON() : order;
    const itemsJson = items.map(item => item.toJSON ? item.toJSON() : item);
    const statusHistoryJson = statusHistory.map(status => status.toJSON ? status.toJSON() : status);

    const accessToken = req.headers.authorization;
    const enrichedOrder = await enrichOrderWithUserProfile(orderJson, accessToken);

    sendSuccessResponse(res, 200, ORDER_FETCH_SUCCESS, {
      order: enrichedOrder,
      orderItems: itemsJson,
      orderStatusHistory: statusHistoryJson
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_FETCH_ERROR, error);
  }
};

/**
 * Get All Orders (basic filtering + pagination) with OrderItems and OrderStatusHistory
 */
export const getAllOrdersHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const where: WhereOptions<any> = {};

    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.templeId) where.templeId = req.query.templeId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.orderType) where.orderType = req.query.orderType;
    if (req.query.paymentStatus) where.paymentStatus = req.query.paymentStatus;

    if (req.query.startDate || req.query.endDate) {
      where.scheduledDate = {};
      if (req.query.startDate) (where.scheduledDate as any)[Op.gte] = req.query.startDate;
      if (req.query.endDate) (where.scheduledDate as any)[Op.lte] = req.query.endDate;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const ordersJson = orders.map(order => order.toJSON ? order.toJSON() : order);

    const ordersWithDetails = await Promise.all(
      ordersJson.map(async (orderJson) => {
        const orderId = String(orderJson.id);
        
        const [items, statusHistory] = await Promise.all([
          OrderItem.findAll({
            where: { orderId },
            order: [['createdAt', 'ASC']]
          }),
          OrderStatusHistory.findAll({
            where: { orderId },
            order: [['createdAt', 'DESC']]
          })
        ]);

        const itemsJson = items.map(item => item.toJSON ? item.toJSON() : item);
        const statusHistoryJson = statusHistory.map(status => status.toJSON ? status.toJSON() : status);

        return {
          ...orderJson,
          orderItems: itemsJson,
          orderStatusHistory: statusHistoryJson
        };
      })
    );

    const accessToken = req.headers.authorization as string;
    const enrichedOrders = await enrichOrdersWithUserProfiles(ordersWithDetails, accessToken);

    sendSuccessResponse(res, 200, ORDER_LIST_SUCCESS, {
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_FETCH_ERROR, error);
  }
};

/**
 * Update Order
 */
export const updateOrderHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) {
      sendErrorResponse(res, 404, ORDER_NOT_FOUND);
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;
    const oldStatus = orderJson.status;
    const newStatus = req.body.status ?? orderJson.status;
    const oldPaymentStatus = orderJson.paymentStatus;
    const newPaymentStatus = req.body.paymentStatus ?? orderJson.paymentStatus;
    const newOrderType = req.body.orderType ?? orderJson.orderType;

    await order.update({
      userId: req.body.userId ?? orderJson.userId,
      templeId: req.body.templeId ?? orderJson.templeId,
      addressId: req.body.addressId ?? orderJson.addressId,
      orderType: newOrderType,
      status: newStatus,
      scheduledDate: req.body.scheduledDate ?? orderJson.scheduledDate,
      scheduledTimestamp: req.body.scheduledTimestamp ?? orderJson.scheduledTimestamp,
      fulfillmentType: req.body.fulfillmentType ?? orderJson.fulfillmentType,
      subtotal: req.body.subtotal ?? orderJson.subtotal,
      discountAmount: req.body.discountAmount ?? orderJson.discountAmount,
      convenienceFee: req.body.convenienceFee ?? orderJson.convenienceFee,
      taxAmount: req.body.taxAmount ?? orderJson.taxAmount,
      totalAmount: req.body.totalAmount ?? orderJson.totalAmount,
      currency: req.body.currency ?? orderJson.currency,
      paymentStatus: newPaymentStatus,
      paymentMethod: req.body.paymentMethod ?? orderJson.paymentMethod,
      paymentId: req.body.paymentId ?? orderJson.paymentId,
      paidAt: req.body.paidAt ?? orderJson.paidAt,
      trackingNumber: req.body.trackingNumber ?? orderJson.trackingNumber,
      carrier: req.body.carrier ?? orderJson.carrier,
      shippedAt: req.body.shippedAt ?? orderJson.shippedAt,
      deliveredAt: req.body.deliveredAt ?? orderJson.deliveredAt,
      contactName: req.body.contactName ?? orderJson.contactName,
      contactPhone: req.body.contactPhone ?? orderJson.contactPhone,
      contactEmail: req.body.contactEmail ?? orderJson.contactEmail,
      cancelledAt: req.body.cancelledAt ?? orderJson.cancelledAt,
      cancellationReason: req.body.cancellationReason ?? orderJson.cancellationReason,
      refundAmount: req.body.refundAmount ?? orderJson.refundAmount,
      shippingAddress: req.body.shippingAddress ?? orderJson.shippingAddress,
      deliveryType: req.body.deliveryType ?? orderJson.deliveryType
    } as any);

    if (oldStatus !== newStatus) {
      try {
        await OrderStatusHistory.create({
          id: randomUUID(),
          orderId: orderJson.id,
          status: newStatus,
          previousStatus: oldStatus,
          notes: `Order status updated from ${oldStatus} to ${newStatus}`,
          location: null
        } as any);
        console.log(`Created order status history for order ${orderJson.id}: ${oldStatus} -> ${newStatus}`);
      } catch (statusHistoryError) {
        console.error('Error creating order status history:', statusHistoryError);
        reportError(statusHistoryError);
      }
    }

    if (oldPaymentStatus !== 'paid' && newPaymentStatus === 'paid') {
      applyOrderReward(
        String(orderJson.userId),
        String(orderJson.id),
        String(newOrderType),
        String(orderJson.orderNumber)
      ).catch(reportError);
    }

    const updatedOrder = await Order.findByPk(req.params.id);
    const updatedOrderJson = updatedOrder?.toJSON ? updatedOrder.toJSON() : updatedOrder;

    sendSuccessResponse(res, 200, ORDER_UPDATED_SUCCESS, { order: updatedOrderJson });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_UPDATE_ERROR, error);
  }
};

/**
 * Delete Order
 */
export const deleteOrderHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) {
      sendErrorResponse(res, 404, ORDER_NOT_FOUND);
      return;
    }

    await order.destroy();
    sendSuccessResponse(res, 200, ORDER_DELETED_SUCCESS, {});
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_DELETE_ERROR, error);
  }
};

/**
 * Get Order Details (Order + Items + Status History)
 */
export const getOrderDetailsHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const orderId = String((req.params as any).orderId);
    const order = await Order.findByPk(orderId);
    if (!order) {
      sendErrorResponse(res, 404, ORDER_NOT_FOUND);
      return;
    }

    const [items, statusHistory] = await Promise.all([
      OrderItem.findAll({ where: { orderId }, order: [['createdAt', 'ASC']] }),
      OrderStatusHistory.findAll({
        where: { orderId },
        order: [['createdAt', 'DESC']]
      })
    ]);

    const orderJson = order.toJSON ? order.toJSON() : order;
    const itemsJson = items.map(item => item.toJSON ? item.toJSON() : item);
    const statusHistoryJson = statusHistory.map(status => status.toJSON ? status.toJSON() : status);

    const accessToken = req.headers.authorization as string;
    const enrichedOrder = await enrichOrderWithUserProfile(orderJson, accessToken);

    sendSuccessResponse(res, 200, ORDER_DETAILS_FETCH_SUCCESS, {
      order: enrichedOrder,
      orderItems: itemsJson,
      orderStatusHistory: statusHistoryJson
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_DETAILS_FETCH_ERROR, error);
  }
};

/**
 * Get Orders by User ID (with OrderItems and OrderStatusHistory)
 */
export const getOrdersByUserIdHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    const userId = String(req.params.userId);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const where: WhereOptions<any> = {
      userId
    };

    // Optional filters
    if (req.query.orderType) where.orderType = req.query.orderType;
    if (req.query.status) where.status = req.query.status;
    if (req.query.paymentStatus) where.paymentStatus = req.query.paymentStatus;

    if (req.query.startDate || req.query.endDate) {
      where.scheduledDate = {};
      if (req.query.startDate) (where.scheduledDate as any)[Op.gte] = req.query.startDate;
      if (req.query.endDate) (where.scheduledDate as any)[Op.lte] = req.query.endDate;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const ordersJson = orders.map(order => order.toJSON ? order.toJSON() : order);

    const ordersWithDetails = await Promise.all(
      ordersJson.map(async (orderJson) => {
        const orderId = String(orderJson.id);
        
        const [items, statusHistory] = await Promise.all([
          OrderItem.findAll({
            where: { orderId },
            order: [['createdAt', 'ASC']]
          }),
          OrderStatusHistory.findAll({
            where: { orderId },
            order: [['createdAt', 'DESC']]
          })
        ]);

        const itemsJson = items.map(item => item.toJSON ? item.toJSON() : item);
        const statusHistoryJson = statusHistory.map(status => status.toJSON ? status.toJSON() : status);

        return {
          ...orderJson,
          orderItems: itemsJson,
          orderStatusHistory: statusHistoryJson
        };
      })
    );

    const accessToken = req.headers.authorization as string;
    const enrichedOrders = await enrichOrdersWithUserProfiles(ordersWithDetails, accessToken);

    sendSuccessResponse(res, 200, ORDER_LIST_SUCCESS, {
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_FETCH_ERROR, error);
  }
};


