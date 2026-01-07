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

/**
 * Create Order
 */
export const createOrderHandler: EndpointHandler<EndpointAuthType.JWT> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  try {
    console.log(req,"req");
    const paymentStatus = req.body.paymentStatus ?? 'pending';
    const order = await Order.create({
      // Ensure orderNumber is always set (model may not define a default).
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

    // Create initial OrderStatusHistory
    try {
      const initialStatus = req.body.status ?? 'pending';
      await OrderStatusHistory.create({
        id: randomUUID(),
        orderId: order.id,
        status: initialStatus,
        previousStatus: null,
        notes: 'Order created',
        location: null
      } as any);
      console.log(`Created initial order status history for order ${order.id} with status: ${initialStatus}`);
    } catch (statusHistoryError) {
      console.error('Error creating order status history:', statusHistoryError);
      // Log error but don't fail the order creation
    }

    sendSuccessResponse(res, 201, ORDER_CREATED_SUCCESS, { order });

    // Best-effort: apply order reward if already paid and eligible
    if ((order as any).orderType && paymentStatus === 'paid') {
      applyOrderReward(
        String(order.userId),
        String(order.id),
        String((order as any).orderType),
        String((order as any).orderNumber)
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

    // Fetch OrderItems and OrderStatusHistory
    const [items, statusHistory] = await Promise.all([
      OrderItem.findAll({ where: { orderId }, order: [['createdAt', 'ASC']] }),
      OrderStatusHistory.findAll({
        where: { orderId },
        order: [['createdAt', 'DESC']]
      })
    ]);

    sendSuccessResponse(res, 200, ORDER_FETCH_SUCCESS, {
      order,
      orderItems: items,
      orderStatusHistory: statusHistory
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

    // Fetch OrderItems and OrderStatusHistory for all orders in batch
    const orderIds = orders.map(order => order.id);
    const [allItems, allStatusHistory] = await Promise.all([
      orderIds.length > 0
        ? OrderItem.findAll({
            where: { orderId: { [Op.in]: orderIds } },
            order: [['createdAt', 'ASC']]
          })
        : Promise.resolve([]),
      orderIds.length > 0
        ? OrderStatusHistory.findAll({
            where: { orderId: { [Op.in]: orderIds } },
            order: [['createdAt', 'DESC']]
          })
        : Promise.resolve([])
    ]);

    // Group items and status history by orderId
    const itemsByOrderId: Record<string, any[]> = {};
    const statusHistoryByOrderId: Record<string, any[]> = {};

    for (const item of allItems) {
      const orderId = String((item as any).orderId);
      if (!itemsByOrderId[orderId]) {
        itemsByOrderId[orderId] = [];
      }
      itemsByOrderId[orderId].push(item);
    }

    for (const history of allStatusHistory) {
      const orderId = String((history as any).orderId);
      if (!statusHistoryByOrderId[orderId]) {
        statusHistoryByOrderId[orderId] = [];
      }
      statusHistoryByOrderId[orderId].push(history);
    }

    // Attach items and status history to each order
    const ordersWithDetails = orders.map(order => {
      const orderId = String(order.id);
      return {
        ...order.toJSON(),
        orderItems: itemsByOrderId[orderId] || [],
        orderStatusHistory: statusHistoryByOrderId[orderId] || []
      };
    });

    sendSuccessResponse(res, 200, ORDER_LIST_SUCCESS, {
      orders: ordersWithDetails,
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

    const oldStatus = order.status;
    const newStatus = req.body.status ?? order.status;
    const oldPaymentStatus = order.paymentStatus;
    const newPaymentStatus = req.body.paymentStatus ?? order.paymentStatus;
    const newOrderType = req.body.orderType ?? order.orderType;

    await order.update({
      userId: req.body.userId ?? order.userId,
      templeId: req.body.templeId ?? order.templeId,
      addressId: req.body.addressId ?? (order as any).addressId,
      orderType: newOrderType,
      status: newStatus,
      scheduledDate: req.body.scheduledDate ?? order.scheduledDate,
      scheduledTimestamp: req.body.scheduledTimestamp ?? order.scheduledTimestamp,
      fulfillmentType: req.body.fulfillmentType ?? order.fulfillmentType,
      subtotal: req.body.subtotal ?? order.subtotal,
      discountAmount: req.body.discountAmount ?? order.discountAmount,
      convenienceFee: req.body.convenienceFee ?? order.convenienceFee,
      taxAmount: req.body.taxAmount ?? order.taxAmount,
      totalAmount: req.body.totalAmount ?? order.totalAmount,
      currency: req.body.currency ?? order.currency,
      paymentStatus: newPaymentStatus,
      paymentMethod: req.body.paymentMethod ?? order.paymentMethod,
      paymentId: req.body.paymentId ?? order.paymentId,
      paidAt: req.body.paidAt ?? order.paidAt,
      trackingNumber: req.body.trackingNumber ?? order.trackingNumber,
      carrier: req.body.carrier ?? order.carrier,
      shippedAt: req.body.shippedAt ?? order.shippedAt,
      deliveredAt: req.body.deliveredAt ?? order.deliveredAt,
      contactName: req.body.contactName ?? order.contactName,
      contactPhone: req.body.contactPhone ?? order.contactPhone,
      contactEmail: req.body.contactEmail ?? order.contactEmail,
      cancelledAt: req.body.cancelledAt ?? order.cancelledAt,
      cancellationReason: req.body.cancellationReason ?? order.cancellationReason,
      refundAmount: req.body.refundAmount ?? order.refundAmount,
      shippingAddress: req.body.shippingAddress ?? (order as any).shippingAddress,
      deliveryType: req.body.deliveryType ?? (order as any).deliveryType
    } as any);

    // Create OrderStatusHistory if status changed
    if (oldStatus !== newStatus) {
      try {
        await OrderStatusHistory.create({
          id: randomUUID(),
          orderId: order.id,
          status: newStatus,
          previousStatus: oldStatus,
          notes: `Order status updated from ${oldStatus} to ${newStatus}`,
          location: null
        } as any);
        console.log(`Created order status history for order ${order.id}: ${oldStatus} -> ${newStatus}`);
      } catch (statusHistoryError) {
        console.error('Error creating order status history:', statusHistoryError);
        // Log error but don't fail the order update
      }
    }

    // Best-effort: apply order reward when payment transitions to paid
    if (oldPaymentStatus !== 'paid' && newPaymentStatus === 'paid') {
      applyOrderReward(
        String(order.userId),
        String(order.id),
        String(newOrderType),
        String((order as any).orderNumber)
      ).catch(reportError);
    }

    sendSuccessResponse(res, 200, ORDER_UPDATED_SUCCESS, { order });
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

    sendSuccessResponse(res, 200, ORDER_DETAILS_FETCH_SUCCESS, {
      order,
      orderItems: items,
      orderStatusHistory: statusHistory
    });
  } catch (error) {
    reportError(error);
    sendErrorResponse(res, 500, ORDER_DETAILS_FETCH_ERROR, error);
  }
};


