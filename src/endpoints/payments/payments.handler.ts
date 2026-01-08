/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType,
  request,
  reportError
} from 'node-server-engine';
import { Response } from 'express';
import { PaymentOrder, PaymentStatus, Order, OrderItem, OrderStatusHistory } from 'db/models';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature
} from 'utils';
import {
  PAYMENT_CAPTURE_FAILED,
  PAYMENT_DETAILS_FETCH_FAILED,
  PAYMENT_ORDER_ALREADY_PROCESSED,
  PAYMENT_ORDER_CREATION_FAILED,
  PAYMENT_ORDER_NOT_FOUND,
  PAYMENT_SIGNATURE_INVALID,
  USER_ID_REQUIRED,
  WEBHOOK_SIGNATURE_INVALID,
  WEBHOOK_PAYLOAD_INVALID,
  WEBHOOK_PROCESSING_FAILED,
  WEBHOOK_EVENT_UNSUPPORTED,
  WEBHOOK_PAYMENT_UPDATE_FAILED,
  WEBHOOK_DUPLICATE_EVENT,
  RAZORPAY_EVENT_PAYMENT_AUTHORIZED,
  RAZORPAY_EVENT_PAYMENT_CAPTURED,
  RAZORPAY_EVENT_PAYMENT_FAILED,
  RAZORPAY_EVENT_ORDER_PAID,
  RAZORPAY_EVENT_REFUND_CREATED,
  RAZORPAY_EVENT_REFUND_PROCESSED,
  DUPLICATE_RUDRAKSHA_BOOKING_ERROR
} from './payments.const';
import {
  CapturePaymentBody,
  CreatePaymentOrderBody,
  ListPaymentsQuery,
  VerifyPaymentBody,
  RazorpayWebhookPayload,
  RazorpayPaymentEntity,
  RazorpayOrderEntity
} from './payments.types';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  notes?: Record<string, unknown>;
  expire_at?: number;
  expires_at?: number;
}

const MINOR_UNIT_MULTIPLIER = 100;


function toMinorUnits(amount: number): number {
  return Math.round(amount * MINOR_UNIT_MULTIPLIER);
}

function fromUnixTimestamp(value?: number | null): Date | undefined {
  if (!value) return undefined;
  return new Date(value * 1000);
}

export const createPaymentOrderHandler: EndpointHandler<
  EndpointAuthType.JWT
> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  const body = req.body as CreatePaymentOrderBody;
  const userId = body.userId?.trim();

  if (!userId) {
    res.status(400).json({ message: USER_ID_REQUIRED });
    return;
  }

  const amountInSubUnits = toMinorUnits(body.amount);
  const currency = (body.currency ?? 'INR').toUpperCase();

  try {
    const client = getRazorpayClient();
    const order = (await client.orders.create({
      amount: amountInSubUnits,
      currency,
      receipt: body.receipt,
      notes: body.notes,
      payment_capture: body.autoCapture ?? false
    })) as RazorpayOrderResponse;

    const record = await PaymentOrder.create({
      userId,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: 'created',
      receipt: order.receipt ?? body.receipt,
      notes: (order.notes as object) ?? body.notes,
      metadata: body.metadata,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      expiresAt: fromUnixTimestamp(
        (order as any).expire_at ?? (order as any).expires_at
      )
    } as any);

    res.status(201).json({
      message: 'Payment order created successfully.',
      order,
      record
    });
  } catch (error) {
    console.error('Payment order creation failed:', (error as Error).message);

    // Check for specific Razorpay errors
    const errorMessage = (error as Error).message;
    let statusCode = 502;
    let responseMessage = PAYMENT_ORDER_CREATION_FAILED;

    if (errorMessage.includes('Invalid amount')) {
      statusCode = 400;
      responseMessage = 'Invalid payment amount provided.';
    } else if (errorMessage.includes('Invalid currency')) {
      statusCode = 400;
      responseMessage = 'Invalid currency code provided.';
    } else if (errorMessage.includes('Authentication failed')) {
      statusCode = 500;
      responseMessage = 'Payment service authentication failed.';
    }

    res.status(statusCode).json({
      message: responseMessage,
      error: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal payment service error'
    });
  }
};

export const listPaymentOrdersHandler: EndpointHandler<
  EndpointAuthType.JWT
> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  const { status, page = 1, pageSize = 25, userId } = req
    .query as unknown as ListPaymentsQuery;
  const offset = (Number(page) - 1) * Number(pageSize);
  const normalizedStatus = status
    ? (status.toLowerCase() as PaymentStatus)
    : undefined;
  const normalizedUserId = userId?.trim();

  try {
    const { rows, count } = await PaymentOrder.findAndCountAll({
      where: {
        ...(normalizedStatus ? { status: normalizedStatus } : undefined),
        ...(normalizedUserId ? { userId: normalizedUserId } : undefined)
      },
      limit: Number(pageSize),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      data: rows,
      page: Number(page),
      pageSize: Number(pageSize),
      total: count
    });
  } catch (error) {
    console.error('listPaymentOrdersHandler', error);
    res.status(500).json({
      message: 'Unable to list payment orders',
      error: (error as Error).message
    });
  }
};

export const getPaymentOrderHandler: EndpointHandler<
  EndpointAuthType.JWT
> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  const { orderId } = req.params as { orderId: string };

  try {
    const record = await PaymentOrder.findOne({
      where: { razorpayOrderId: orderId }
    });

    if (!record) {
      res.status(404).json({ message: PAYMENT_ORDER_NOT_FOUND });
      return;
    }

    const client = getRazorpayClient();
    const [remoteOrder, payments] = await Promise.all([
      client.orders.fetch(orderId),
      client.payments.all({ order_id: orderId } as Record<string, unknown>)
    ]);

    res.status(200).json({
      record,
      remoteOrder,
      payments
    });
  } catch (error) {
    console.error('getPaymentOrderHandler', error);
    res.status(502).json({
      message: PAYMENT_DETAILS_FETCH_FAILED,
      error: (error as Error).message
    });
  }
};

export const verifyPaymentSignatureHandler: EndpointHandler<
  EndpointAuthType.JWT
> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  const body = req.body as VerifyPaymentBody;

  try {
    // Verify payment signature with error handling
    let isValid: boolean;
    try {
      isValid = verifyPaymentSignature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature
      );
    } catch (sigError) {
      console.error('Error during signature verification:', sigError);
      res.status(500).json({
        message: 'Signature verification failed',
        error: process.env.NODE_ENV === 'development' ? (sigError as Error).message : 'Internal server error'
      });
      return;
    }

    if (!isValid) {
      console.error(`Invalid payment signature for order ${body.razorpay_order_id}`);
      res.status(400).json({ message: PAYMENT_SIGNATURE_INVALID });
      return;
    }

    // Find PaymentOrder - try Sequelize first, then raw query as fallback
    let order = await PaymentOrder.findOne({
      where: { razorpayOrderId: body.razorpay_order_id }
    });

    // Fallback: Try raw query in case of column name mismatch
    if (!order) {
      try {
        const { sequelize } = await import('node-server-engine');
        const dialect = (process.env.SQL_TYPE ?? 'postgres').toLowerCase();
        
        let query = '';
        if (dialect === 'postgres') {
          query = `SELECT * FROM "PaymentOrders" WHERE "razorpayOrderId" = $1 OR "razorpay_order_id" = $1 LIMIT 1`;
        } else {
          query = `SELECT * FROM PaymentOrders WHERE razorpayOrderId = ? OR razorpay_order_id = ? LIMIT 1`;
        }
        
        const [results]: any = await sequelize.getQueryInterface().sequelize.query(query, {
          replacements: dialect === 'postgres' ? [body.razorpay_order_id] : [body.razorpay_order_id, body.razorpay_order_id],
          type: QueryTypes.SELECT
        });
        
        if (results && results.length > 0) {
          order = PaymentOrder.build(results[0]);
          console.log('[DEBUG] Order found using raw query fallback');
        }
      } catch (rawQueryError) {
        console.error('[DEBUG] Error with raw query fallback:', rawQueryError);
      }
    }

    if (!order) {
      console.error(`[ERROR] PaymentOrder not found: ${body.razorpay_order_id}`);
      console.error('[DEBUG] Request body userId:', body.userId);
      res.status(404).json({ 
        message: PAYMENT_ORDER_NOT_FOUND,
        searchedId: body.razorpay_order_id
      });
      return;
    }

    if (
      order.razorpayPaymentId &&
      order.razorpayPaymentId !== body.razorpay_payment_id
    ) {
      console.warn(`Payment ID mismatch for order ${body.razorpay_order_id}: existing ${order.razorpayPaymentId}, received ${body.razorpay_payment_id}`);
      res.status(409).json({ message: PAYMENT_ORDER_ALREADY_PROCESSED });
      return;
    }

    // Prevent double processing
    if (order.status === 'paid' || order.status === 'captured') {
      console.warn(`Order ${body.razorpay_order_id} already processed with status: ${order.status}`);
      const existingAppOrderId = (order.metadata as any)?.appOrderId as string | undefined;
      res.status(200).json({
        message: 'Payment already verified',
        order,
        appOrderId: existingAppOrderId
      });
      return;
    }

    // Update status to 'paid' unless already captured (which would be handled by webhooks)
    await order.update({
      razorpayPaymentId: body.razorpay_payment_id,
      razorpaySignature: body.razorpay_signature,
      status: 'paid' as PaymentStatus
    });

    // Store orderData in PaymentOrder.metadata for webhook access
    // Order creation will happen in webhook handlers (handlePaymentCaptured or handleOrderPaid)
    const metadata = (order.metadata as Record<string, unknown> | undefined) ?? {};
    
    // Validate required fields for storing orderData
    if (!body.userId) {
      console.error('[ERROR] userId is required but missing in request body');
      res.status(400).json({ 
        message: 'User ID is required to store order data',
        error: 'userId is missing from request body'
      });
      return;
    }

    if (!body.orderType) {
      console.error('[ERROR] orderType is required but missing in request body');
      res.status(400).json({ 
        message: 'Order type is required to store order data',
        error: 'orderType is missing from request body'
      });
      return;
    }

    // Store complete order data in metadata if not already stored (for webhook access)
    if (!(metadata as any).orderData) {
      const orderDataToStore = {
        userId: body.userId,
        orderType: body.orderType,
        templeId: body.templeId,
        addressId: body.addressId,
        status: body.status,
        scheduledDate: body.scheduledDate,
        scheduledTimestamp: body.scheduledTimestamp,
        fulfillmentType: body.fulfillmentType,
        subtotal: body.subtotal,
        discountAmount: body.discountAmount,
        convenienceFee: body.convenienceFee,
        taxAmount: body.taxAmount,
        totalAmount: body.totalAmount,
        currency: body.currency,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        shippingAddress: body.shippingAddress,
        deliveryType: body.deliveryType,
        orderItems: body.orderItems,
        rudrakshaBookingData: body.rudrakshaBookingData
      };

      await order.update({
        metadata: {
          ...metadata,
          orderData: orderDataToStore,
          razorpayPaymentId: body.razorpay_payment_id
        }
      } as any);
    }

    console.log(`Payment verified successfully for order ${body.razorpay_order_id}. Order will be created via webhook.`);
    res.status(200).json({
      message: 'Payment verified successfully. Order will be created via webhook.',
      order,
      status: 'verified'
    });
  } catch (error) {
    const err = error as Error;
    const errorMessage = err.message || String(error);
    const errorStack = err.stack;
    
    console.error('[ERROR] verifyPaymentSignatureHandler failed:', errorMessage);
    console.error('[ERROR] Error name:', err.name);
    console.error('[ERROR] Error stack:', errorStack);
    console.error('[ERROR] Request body keys:', Object.keys(body));
    console.error('[ERROR] Request body (sanitized):', {
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      userId: body.userId,
      orderType: body.orderType,
      hasOrderItems: !!body.orderItems,
      orderItemsCount: body.orderItems?.length || 0
    });
    
    // Provide more specific error messages based on error type
    let statusCode = 500;
    let responseMessage = 'Unable to verify payment signature';
    
    if (errorMessage.includes('Database constraint violation') || errorMessage.includes('null value') || errorMessage.includes('NOT NULL')) {
      statusCode = 400;
      responseMessage = 'Invalid order data provided. Check that all required fields are present.';
    } else if (errorMessage.includes('Foreign key violation') || errorMessage.includes('FOREIGN KEY')) {
      statusCode = 400;
      responseMessage = 'Invalid reference ID. Check that userId, templeId, or addressId exist in their respective tables.';
    } else if (errorMessage.includes('Duplicate key violation') || errorMessage.includes('UNIQUE')) {
      statusCode = 409;
      responseMessage = 'Order already exists';
    } else if (errorMessage.includes('User ID is required') || errorMessage.includes('Order type is required')) {
      statusCode = 400;
      responseMessage = errorMessage;
    }
    
    // Always return detailed error in response for debugging
    res.status(statusCode).json({
      message: responseMessage,
      error: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        name: err.name,
        userId: body.userId,
        orderType: body.orderType,
        razorpay_order_id: body.razorpay_order_id
      } : undefined
    });
  }
};

/**
 * Reusable function to create Order, OrderItems, OrderStatusHistory, and RudrakshaBooking
 * from PaymentOrder metadata. Used by webhook handlers.
 * 
 * @param paymentOrder - The PaymentOrder record
 * @param orderData - Order creation data (from PaymentOrder.metadata.orderData)
 * @param accessToken - Optional access token for RudrakshaBooking creation
 * @returns Created or existing Order, or null if creation failed
 */
async function createOrderFromPaymentOrderData(
  paymentOrder: PaymentOrder,
  orderData: any,
  accessToken?: string
): Promise<Order | null> {
  try {
    // Validate required fields
    if (!orderData.userId) {
      console.error('[WEBHOOK] userId is required but missing in orderData');
      return null;
    }

    if (!orderData.orderType) {
      console.error('[WEBHOOK] orderType is required but missing in orderData');
      return null;
    }

    // Check idempotency - if Order already exists, return it
    const metadata = (paymentOrder.metadata as Record<string, unknown> | undefined) ?? {};
    const existingAppOrderId = (metadata as any).appOrderId as string | undefined;

    if (existingAppOrderId) {
      console.log(`[WEBHOOK] Order already exists with id ${existingAppOrderId}, skipping creation`);
      const existingOrder = await Order.findByPk(existingAppOrderId);
      return existingOrder;
    }

    // Check for duplicate Rudraksha booking if orderType is 'event' and booking data is provided
    if (orderData.orderType === 'event' && orderData.rudrakshaBookingData) {
      const bookingData = orderData.rudrakshaBookingData;
      if (bookingData.preferredDate && bookingData.preferredTimeSlot) {
        try {
          const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
          if (appcontrolUrl) {
            // Fetch existing bookings for this user
            const bookingsUrl = `${appcontrolUrl}/launch-event/rudraksha-bookings?userId=${encodeURIComponent(bookingData.userId)}`;
            const bookingsRes: any = await request({
              method: 'GET',
              url: bookingsUrl,
              headers: {
                ...(accessToken ? { 'Authorization': accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}` } : {}),
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });

            // Check if any existing booking matches the same date and time slot
            if (bookingsRes?.data?.success && bookingsRes?.data?.data?.bookings) {
              const existingBookings = Array.isArray(bookingsRes.data.data.bookings) 
                ? bookingsRes.data.data.bookings 
                : [];
              
              // Normalize the preferredDate format (remove time if present)
              const normalizedPreferredDate = bookingData.preferredDate?.includes('T')
                ? bookingData.preferredDate.split('T')[0]
                : bookingData.preferredDate;

              if (normalizedPreferredDate && bookingData.preferredTimeSlot) {
                const duplicateBooking = existingBookings.find((booking: any) => {
                  // Handle new object format
                  if (booking.preferredTimeSlot && typeof booking.preferredTimeSlot === 'object' && !Array.isArray(booking.preferredTimeSlot)) {
                    const timeSlots = booking.preferredTimeSlot[normalizedPreferredDate];
                    if (timeSlots) {
                      const slotArray = Array.isArray(timeSlots) ? timeSlots : [timeSlots];
                      return slotArray.includes(bookingData.preferredTimeSlot);
                    }
                    return false;
                  } else if (Array.isArray(booking.preferredDate) && Array.isArray(booking.preferredTimeSlot)) {
                    const existingDates = booking.preferredDate;
                    const existingTimeSlots = booking.preferredTimeSlot;
                    for (let i = 0; i < existingDates.length; i++) {
                      const existingDate = existingDates[i]?.includes('T')
                        ? existingDates[i].split('T')[0]
                        : existingDates[i];
                      if (existingDate === normalizedPreferredDate && existingTimeSlots[i] === bookingData.preferredTimeSlot) {
                        return true;
                      }
                    }
                    return false;
                  } else {
                    const existingDate = booking.preferredDate 
                      ? (typeof booking.preferredDate === 'string' && booking.preferredDate.includes('T') 
                          ? booking.preferredDate.split('T')[0] 
                          : booking.preferredDate)
                      : null;
                    return (
                      existingDate === normalizedPreferredDate &&
                      booking.preferredTimeSlot === bookingData.preferredTimeSlot
                    );
                  }
                });

                if (duplicateBooking) {
                  console.warn(`[WEBHOOK] [DUPLICATE_BOOKING] User ${bookingData.userId} already has a booking for date ${normalizedPreferredDate} and time slot ${bookingData.preferredTimeSlot}`);
                  // For webhook, we don't throw - just log and return null
                  return null;
                }
              }
            }
          }
        } catch (duplicateCheckError) {
          // Log error but don't fail - best-effort validation
          console.error('[WEBHOOK] [ERROR] Failed to check for duplicate booking:', duplicateCheckError);
          reportError(duplicateCheckError);
        }
      }
    }

    // Create Order
    let createdOrder: Order | null = null;
    try {
      // Prepare order data with all required fields
      const orderDataToCreate: any = {
        orderNumber: randomUUID(),
        userId: orderData.userId,
        orderType: orderData.orderType,
        status: orderData.status ?? 'pending',
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        paidAt: new Date()
      };

      // Add optional fields only if they exist
      if (orderData.templeId) orderDataToCreate.templeId = orderData.templeId;
      if (orderData.addressId) orderDataToCreate.addressId = orderData.addressId;
      if (orderData.scheduledDate) orderDataToCreate.scheduledDate = orderData.scheduledDate;
      if (orderData.scheduledTimestamp) orderDataToCreate.scheduledTimestamp = orderData.scheduledTimestamp;
      if (orderData.fulfillmentType) orderDataToCreate.fulfillmentType = orderData.fulfillmentType;
      if (orderData.subtotal !== undefined) orderDataToCreate.subtotal = String(orderData.subtotal);
      if (orderData.discountAmount !== undefined) orderDataToCreate.discountAmount = String(orderData.discountAmount);
      if (orderData.convenienceFee !== undefined) orderDataToCreate.convenienceFee = String(orderData.convenienceFee);
      if (orderData.taxAmount !== undefined) orderDataToCreate.taxAmount = String(orderData.taxAmount);
      if (orderData.totalAmount !== undefined) orderDataToCreate.totalAmount = String(orderData.totalAmount);
      if (orderData.currency) orderDataToCreate.currency = orderData.currency;
      else if (paymentOrder.currency) orderDataToCreate.currency = paymentOrder.currency;
      if (orderData.contactName) orderDataToCreate.contactName = orderData.contactName;
      if (orderData.contactPhone) orderDataToCreate.contactPhone = orderData.contactPhone;
      if (orderData.contactEmail) orderDataToCreate.contactEmail = orderData.contactEmail;
      else if (paymentOrder.customerEmail) orderDataToCreate.contactEmail = paymentOrder.customerEmail;
      if (orderData.shippingAddress) orderDataToCreate.shippingAddress = orderData.shippingAddress;
      if (orderData.deliveryType) orderDataToCreate.deliveryType = orderData.deliveryType;

      // Explicitly set id (UUID generation)
      const orderId = randomUUID();
      orderDataToCreate.id = orderId;

      createdOrder = await Order.create(orderDataToCreate);
      
      // Verify order was created
      if (!createdOrder) {
        throw new Error('Order creation returned null/undefined');
      }
      
      // Ensure id is accessible
      if (!createdOrder.id) {
        (createdOrder as any).id = orderId;
        console.warn('[WEBHOOK] [WARN] Order.id was not set by Sequelize, using generated id');
      }

      // Update PaymentOrder metadata with appOrderId
      await paymentOrder.update({
        metadata: {
          ...metadata,
          appOrderId: createdOrder.id
        }
      } as any);

      console.log(`[WEBHOOK] [SUCCESS] Created Order ${createdOrder.id} for PaymentOrder ${paymentOrder.razorpayOrderId}`);
    } catch (orderCreateError) {
      const error = orderCreateError as Error;
      console.error('[WEBHOOK] [ERROR] Failed to create Order:', error.message);
      reportError(orderCreateError);
      return null;
    }

    // Create OrderItems if provided
    if (createdOrder && orderData.orderItems && Array.isArray(orderData.orderItems) && orderData.orderItems.length > 0) {
      const orderId = String(createdOrder.get ? createdOrder.get('id') : (createdOrder as any).dataValues?.id || createdOrder.id);
      
      if (orderId && orderId !== 'undefined' && orderId !== 'null') {
        // Check if orderItems already exist (idempotency)
        const existingOrderItems = await OrderItem.findAll({
          where: { orderId }
        });

        if (existingOrderItems.length === 0) {
          try {
            console.log(`[WEBHOOK] Creating ${orderData.orderItems.length} OrderItems for order ${orderId}`);
            
            await Promise.all(
              orderData.orderItems.map(async (item: any) => {
                if (!item.itemType) {
                  throw new Error(`OrderItem missing required field 'itemType': ${JSON.stringify(item)}`);
                }

                return await OrderItem.create({
                  id: randomUUID(),
                  orderId: orderId,
                  itemType: item.itemType,
                  itemId: item.itemId || null,
                  itemName: item.itemName || null,
                  itemDescription: item.itemDescription || null,
                  itemImageUrl: item.itemImageUrl || null,
                  productId: item.productId || null,
                  pujaId: item.pujaId || null,
                  prasadId: item.prasadId || null,
                  dharshanId: item.dharshanId || null,
                  quantity: item.quantity || null,
                  unitPrice: item.unitPrice ? String(item.unitPrice) : null,
                  totalPrice: item.totalPrice ? String(item.totalPrice) : null,
                  itemDetails: item.itemDetails || null,
                  status: item.status || null
                } as any);
              })
            );
            
            console.log(`[WEBHOOK] [SUCCESS] Created OrderItems for order ${orderId}`);
          } catch (orderItemError) {
            console.error('[WEBHOOK] [ERROR] Failed to create orderItems:', orderItemError);
            reportError(orderItemError);
            // Don't fail - order is already created
          }
        } else {
          console.log(`[WEBHOOK] OrderItems already exist for order ${orderId}, skipping creation`);
        }
      }
    }

    // Create OrderStatusHistory
    if (createdOrder) {
      const existingStatusHistory = await OrderStatusHistory.findOne({
        where: { orderId: createdOrder.id }
      });

      if (!existingStatusHistory) {
        try {
          const initialStatus = orderData.status ?? 'pending';
          await OrderStatusHistory.create({
            id: randomUUID(),
            orderId: createdOrder.id,
            status: initialStatus,
            previousStatus: null,
            notes: 'Order created via Razorpay webhook',
            location: null
          } as any);
          console.log(`[WEBHOOK] Created initial order status history for order ${createdOrder.id}`);
        } catch (statusHistoryError) {
          console.error('[WEBHOOK] [ERROR] Failed to create order status history:', statusHistoryError);
          reportError(statusHistoryError);
          // Don't fail - order is already created
        }
      }
    }

    // Create RudrakshaBooking if orderType is "event"
    if (createdOrder && orderData.orderType === 'event' && orderData.rudrakshaBookingData && createdOrder.id) {
      try {
        const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
        if (appcontrolUrl) {
          const bookingPayload = {
            ...orderData.rudrakshaBookingData,
            orderId: createdOrder.id
          };

          await request({
            method: 'POST',
            url: `${appcontrolUrl}/launch-event/rudraksha-booking`,
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}` } : {})
            },
            data: bookingPayload,
            timeout: 10000
          });

          console.log(`[WEBHOOK] [SUCCESS] Created RudrakshaBooking for Order ${createdOrder.id}`);
        } else {
          console.warn('[WEBHOOK] [WARN] APPCONTROL_SERVICE_URL not configured; skipping RudrakshaBooking creation');
        }
      } catch (bookingError) {
        // Best-effort: log error but don't fail
        console.error('[WEBHOOK] [ERROR] Failed to create RudrakshaBooking:', bookingError);
        reportError(bookingError);
      }
    }

    return createdOrder;
  } catch (error) {
    console.error('[WEBHOOK] [ERROR] createOrderFromPaymentOrderData failed:', error);
    reportError(error);
    return null;
  }
}

export const capturePaymentHandler: EndpointHandler<
  EndpointAuthType.JWT
> = async (
  req: EndpointRequestType[EndpointAuthType.JWT],
  res: Response
) => {
  const body = req.body as CapturePaymentBody;

  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayPaymentId: body.paymentId }
    });

    if (!order) {
      console.error(`Order not found for payment ID: ${body.paymentId}`);
      res.status(404).json({ message: PAYMENT_ORDER_NOT_FOUND });
      return;
    }

    // Check if already captured
    if (order.status === 'captured') {
      console.warn(`Payment ${body.paymentId} already captured`);
      res.status(200).json({
        message: 'Payment already captured',
        order
      });
      return;
    }

    const client = getRazorpayClient();
    const captureAmount = body.amount
      ? toMinorUnits(body.amount)
      : order.amount;

    if (!captureAmount) {
      res.status(400).json({
        message: 'Amount is required when the payment amount is unknown'
      });
      return;
    }

    const captureResponse = await client.payments.capture(
      body.paymentId,
      captureAmount,
      (body.currency ?? order.currency ?? 'INR').toUpperCase()
    );

    await order.update({
      status: 'captured',
      capturedAt: fromUnixTimestamp((captureResponse as any).captured_at),
      amount: Number(captureResponse.amount),
      failureReason: undefined
    });

    console.log(`Payment ${body.paymentId} captured successfully`);
    res.status(200).json({
      message: 'Payment captured successfully',
      capture: captureResponse,
      order
    });
  } catch (error) {
    console.error('capturePaymentHandler error:', error);
    const errorMessage = (error as Error).message;

    // Handle specific Razorpay capture errors
    let statusCode = 502;
    let responseMessage = PAYMENT_CAPTURE_FAILED;

    if (errorMessage.includes('Payment not authorized')) {
      statusCode = 400;
      responseMessage = 'Payment is not authorized for capture.';
    } else if (errorMessage.includes('Payment already captured')) {
      statusCode = 409;
      responseMessage = 'Payment has already been captured.';
    } else if (errorMessage.includes('Invalid capture amount')) {
      statusCode = 400;
      responseMessage = 'Invalid capture amount provided.';
    }

    res.status(statusCode).json({
      message: responseMessage,
      error: process.env.NODE_ENV === 'development' ? errorMessage : 'Payment capture failed'
    });
  }
};

// Webhook event handlers
async function handlePaymentAuthorized(paymentEntity: RazorpayPaymentEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: paymentEntity.order_id }
    });

    if (!order) {
      console.warn(`Order not found for payment ${paymentEntity.id}`);
      return;
    }

    // Update payment status to authorized
    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'authorized',
      amount: paymentEntity.amount,
      failureReason: undefined,
      metadata: {
        ...order.metadata,
        razorpayPaymentEntity: paymentEntity
      }
    });

    console.log(`Payment ${paymentEntity.id} authorized for order ${paymentEntity.order_id}`);
  } catch (error) {
    console.error('Error handling payment authorized event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

async function handlePaymentCaptured(paymentEntity: RazorpayPaymentEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: paymentEntity.order_id }
    });

    if (!order) {
      console.warn(`Order not found for payment ${paymentEntity.id}`);
      return;
    }

    // Update payment status to captured
    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'captured',
      amount: paymentEntity.amount,
      capturedAt: fromUnixTimestamp(paymentEntity.captured_at),
      failureReason: undefined,
      metadata: {
        ...order.metadata,
        razorpayPaymentEntity: paymentEntity
      }
    });

    console.log(`[WEBHOOK] Payment ${paymentEntity.id} captured for order ${paymentEntity.order_id}`);

    // Check if order data exists in metadata and create order if not already created
    const updatedMetadata = (order.metadata as any) || {};
    const orderData = updatedMetadata.orderData;
    const existingAppOrderId = updatedMetadata.appOrderId;

    if (!existingAppOrderId && orderData && orderData.userId && orderData.orderType) {
      try {
        console.log(`[WEBHOOK] Creating Order from webhook for payment ${paymentEntity.id}`);
        await createOrderFromPaymentOrderData(order, orderData, undefined);
        console.log(`[WEBHOOK] Successfully created Order from webhook for payment ${paymentEntity.id}`);
      } catch (orderCreateError) {
        // Log but don't fail webhook - best effort
        console.error('[WEBHOOK] Failed to create order from webhook:', orderCreateError);
        reportError(orderCreateError);
      }
    } else if (existingAppOrderId) {
      console.log(`[WEBHOOK] Order already exists (${existingAppOrderId}), skipping creation`);
    } else {
      console.log('[WEBHOOK] Order data not found in metadata, skipping order creation');
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment captured event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

async function handlePaymentFailed(paymentEntity: RazorpayPaymentEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: paymentEntity.order_id }
    });

    if (!order) {
      console.warn(`Order not found for payment ${paymentEntity.id}`);
      return;
    }

    // Update payment status to failed
    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'failed',
      amount: paymentEntity.amount,
      failureReason: paymentEntity.error_description || 'Payment failed',
      metadata: {
        ...order.metadata,
        razorpayPaymentEntity: paymentEntity
      }
    });

    console.log(`Payment ${paymentEntity.id} failed for order ${paymentEntity.order_id}: ${paymentEntity.error_description}`);
  } catch (error) {
    console.error('Error handling payment failed event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

async function handleOrderPaid(orderEntity: RazorpayOrderEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: orderEntity.id }
    });

    if (!order) {
      console.warn(`Order not found: ${orderEntity.id}`);
      return;
    }

    // Update order status to paid if not already captured
    if (order.status !== 'captured') {
      await order.update({
        status: 'paid',
        metadata: {
          ...order.metadata,
          razorpayOrderEntity: orderEntity
        }
      });
    }

    console.log(`[WEBHOOK] Order ${orderEntity.id} marked as paid`);

    // Check if order data exists in metadata and create order if not already created
    const updatedMetadata = (order.metadata as any) || {};
    const orderData = updatedMetadata.orderData;
    const existingAppOrderId = updatedMetadata.appOrderId;

    if (!existingAppOrderId && orderData && orderData.userId && orderData.orderType) {
      try {
        console.log(`[WEBHOOK] Creating Order from webhook for Razorpay order ${orderEntity.id}`);
        await createOrderFromPaymentOrderData(order, orderData, undefined);
        console.log(`[WEBHOOK] Successfully created Order from webhook for Razorpay order ${orderEntity.id}`);
      } catch (orderCreateError) {
        // Log but don't fail webhook - best effort
        console.error('[WEBHOOK] Failed to create order from webhook:', orderCreateError);
        reportError(orderCreateError);
      }
    } else if (existingAppOrderId) {
      console.log(`[WEBHOOK] Order already exists (${existingAppOrderId}), skipping creation`);
    } else {
      console.log('[WEBHOOK] Order data not found in metadata, skipping order creation');
    }
  } catch (error) {
    console.error('[WEBHOOK] Error handling order paid event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

export const razorpayWebhookHandler: EndpointHandler<
  EndpointAuthType.NONE
> = async (
  req: EndpointRequestType[EndpointAuthType.NONE],
  res: Response
) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      res.status(400).json({ message: WEBHOOK_SIGNATURE_INVALID });
      return;
    }

    const payload = req.body as RazorpayWebhookPayload;

    // Validate payload structure
    if (!payload.event || !payload.payload) {
      res.status(400).json({ message: WEBHOOK_PAYLOAD_INVALID });
      return;
    }

    console.log(`Processing webhook event: ${payload.event}`);

    // Process different webhook events
    try {
      switch (payload.event) {
        case RAZORPAY_EVENT_PAYMENT_AUTHORIZED:
          if (payload.payload.payment?.entity) {
            await handlePaymentAuthorized(payload.payload.payment.entity);
          }
          break;

        case RAZORPAY_EVENT_PAYMENT_CAPTURED:
          if (payload.payload.payment?.entity) {
            await handlePaymentCaptured(payload.payload.payment.entity);
          }
          break;

        case RAZORPAY_EVENT_PAYMENT_FAILED:
          if (payload.payload.payment?.entity) {
            await handlePaymentFailed(payload.payload.payment.entity);
          }
          break;

        case RAZORPAY_EVENT_ORDER_PAID:
          if (payload.payload.order?.entity) {
            await handleOrderPaid(payload.payload.order.entity);
          }
          break;

        case RAZORPAY_EVENT_REFUND_CREATED:
        case RAZORPAY_EVENT_REFUND_PROCESSED:
          // Handle refund events (can be implemented later if needed)
          console.log(`Refund event received: ${payload.event}`);
          break;

        default:
          console.warn(`Unsupported webhook event: ${payload.event}`);
          res.status(200).json({
            message: WEBHOOK_EVENT_UNSUPPORTED,
            event: payload.event
          });
          return;
      }

      res.status(200).json({
        message: 'Webhook processed successfully',
        event: payload.event
      });

    } catch (processingError) {
      console.error('Error processing webhook:', processingError);
      res.status(500).json({
        message: WEBHOOK_PROCESSING_FAILED,
        error: (processingError as Error).message
      });
    }

  } catch (error) {
    console.error('razorpayWebhookHandler error:', error);
    res.status(500).json({
      message: 'Webhook handler failed',
      error: (error as Error).message
    });
  }
};



