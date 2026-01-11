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
import {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature
} from 'utils';
import {
  sanitizeUUID,
  sanitizeUUIDFields
} from 'utils/uuidValidator';
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
  const userId = body.userId?.trim() || ((req as any).user as any)?.id;

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

    const recordJson = record.toJSON ? record.toJSON() : record;

    res.status(201).json({
      message: 'Payment order created successfully.',
      order,
      record: recordJson
    });
  } catch (error) {
    console.error('Payment order creation failed:', (error as Error).message);

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

    const data = rows.map(row => row.toJSON ? row.toJSON() : row);

    res.status(200).json({
      data,
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

    const recordJson = record.toJSON ? record.toJSON() : record;

    res.status(200).json({
      record: recordJson,
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

    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: body.razorpay_order_id }
    });

    if (!order) {
      console.error(`[ERROR] PaymentOrder not found: ${body.razorpay_order_id}`);
      res.status(404).json({ 
        message: PAYMENT_ORDER_NOT_FOUND,
        searchedId: body.razorpay_order_id
      });
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;

    if (
      orderJson.razorpayPaymentId &&
      orderJson.razorpayPaymentId !== body.razorpay_payment_id
    ) {
      console.warn(`Payment ID mismatch for order ${body.razorpay_order_id}: existing ${orderJson.razorpayPaymentId}, received ${body.razorpay_payment_id}`);
      res.status(409).json({ message: PAYMENT_ORDER_ALREADY_PROCESSED });
      return;
    }

    if (orderJson.status === 'paid' || orderJson.status === 'captured') {
      console.warn(`Order ${body.razorpay_order_id} already processed with status: ${orderJson.status}`);
      const existingAppOrderId = ((orderJson.metadata as any) || {})?.appOrderId as string | undefined;
      res.status(200).json({
        message: 'Payment already verified',
        order: orderJson,
        appOrderId: existingAppOrderId
      });
      return;
    }

    const metadata = (orderJson.metadata as Record<string, unknown> | undefined) ?? {};
    
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

    // Validate and sanitize UUID fields
    const sanitizedBody = sanitizeUUIDFields(body, ['userId', 'templeId', 'addressId']);
    
    // Validate required userId UUID
    if (!sanitizedBody.userId) {
      console.error('[ERROR] userId is required and must be a valid UUID');
      res.status(400).json({ 
        message: 'User ID is required and must be a valid UUID format',
        error: `Invalid userId format: "${body.userId}". Expected UUID format (e.g., "550e8400-e29b-41d4-a716-446655440000").`
      });
      return;
    }

    const orderDataToStore = {
      userId: sanitizedBody.userId,
      orderType: body.orderType,
      templeId: sanitizedBody.templeId || null, // Set to null if invalid UUID
      addressId: sanitizedBody.addressId || null, // Set to null if invalid UUID
      status: body.status ?? 'pending',
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
      razorpayPaymentId: body.razorpay_payment_id,
      razorpaySignature: body.razorpay_signature,
      status: 'paid' as PaymentStatus,
      metadata: {
        ...metadata,
        orderData: orderDataToStore,
        razorpayPaymentId: body.razorpay_payment_id,
        verifiedAt: new Date().toISOString()
      }
    } as any);

    const updatedOrder = await PaymentOrder.findOne({
      where: { razorpayOrderId: body.razorpay_order_id }
    });

    if (!updatedOrder) {
      res.status(500).json({ message: 'Failed to update payment order' });
      return;
    }

    const updatedOrderJson = updatedOrder.toJSON ? updatedOrder.toJSON() : updatedOrder;
    const updatedMetadata = (updatedOrderJson.metadata as Record<string, unknown> | undefined) ?? {};
    const orderData = updatedMetadata.orderData as any;
    const existingAppOrderId = updatedMetadata.appOrderId as string | undefined;

    let appOrderId = existingAppOrderId;

    if (!existingAppOrderId && orderData && orderData.userId && orderData.orderType) {
      try {
        const createdAppOrder = await createOrderFromPaymentOrderData(updatedOrder, orderData, req.headers.authorization as string);
        if (createdAppOrder && createdAppOrder.id) {
          appOrderId = String(createdAppOrder.id);
        }
      } catch (orderCreateError) {
        const error = orderCreateError as Error;
        console.error('[VERIFY] Failed to create order immediately:', error.message);
        reportError(orderCreateError);
      }
    }

    console.log(`Payment verified successfully for order ${body.razorpay_order_id}. ${appOrderId ? `Order ${appOrderId} created.` : 'Order will be created via webhook.'}`);
    res.status(200).json({
      message: appOrderId ? 'Payment verified and order created successfully.' : 'Payment verified successfully. Order will be created automatically via webhook.',
      order: updatedOrderJson,
      appOrderId: appOrderId,
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
): Promise<any | null> {
  try {
    if (!orderData.userId || !orderData.orderType) {
      console.error('[WEBHOOK] userId and orderType are required');
      return null;
    }

    const sanitizedUserId = sanitizeUUID(String(orderData.userId));
    if (!sanitizedUserId) {
      console.error(`[WEBHOOK] Invalid userId: "${orderData.userId}"`);
      return null;
    }

    if (orderData.orderItems && Array.isArray(orderData.orderItems)) {
      orderData.orderItems = orderData.orderItems.map((item: any) => ({
        ...item,
        itemId: item.itemId ? sanitizeUUID(String(item.itemId)) : null,
        productId: item.productId ? sanitizeUUID(String(item.productId)) : null,
        pujaId: item.pujaId ? sanitizeUUID(String(item.pujaId)) : null,
        prasadId: item.prasadId ? sanitizeUUID(String(item.prasadId)) : null,
        dharshanId: item.dharshanId ? sanitizeUUID(String(item.dharshanId)) : null,
      }));
    }

    const paymentOrderJson = paymentOrder.toJSON ? paymentOrder.toJSON() : paymentOrder;
    const metadata = (paymentOrderJson.metadata as Record<string, unknown> | undefined) ?? {};
    const existingAppOrderId = metadata.appOrderId as string | undefined;

    if (existingAppOrderId) {
      const existingOrder = await Order.findByPk(existingAppOrderId);
      if (existingOrder) {
        return existingOrder.toJSON ? existingOrder.toJSON() : existingOrder;
      }
    }

    if (orderData.orderType === 'event' && orderData.rudrakshaBookingData) {
      const bookingData = orderData.rudrakshaBookingData;
      if (bookingData.preferredDate && bookingData.preferredTimeSlot) {
        try {
          const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
          if (appcontrolUrl) {
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

            if (bookingsRes?.data?.success && bookingsRes?.data?.data?.bookings) {
              const existingBookings = Array.isArray(bookingsRes.data.data.bookings) 
                ? bookingsRes.data.data.bookings 
                : [];
              
              const normalizedPreferredDate = bookingData.preferredDate?.includes('T')
                ? bookingData.preferredDate.split('T')[0]
                : bookingData.preferredDate;

              if (normalizedPreferredDate && bookingData.preferredTimeSlot) {
                const duplicateBooking = existingBookings.find((booking: any) => {
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
                  return null;
                }
              }
            }
          }
        } catch (duplicateCheckError) {
          console.error('[WEBHOOK] [ERROR] Failed to check for duplicate booking:', duplicateCheckError);
          reportError(duplicateCheckError);
        }
      }
    }

    let createdOrder: Order | null = null;
    let orderDataToCreate: any = {};
    try {
      const paymentOrderJson = paymentOrder.toJSON ? paymentOrder.toJSON() : paymentOrder;
      const sanitizedTempleId = orderData.templeId ? sanitizeUUID(String(orderData.templeId)) : null;
      const sanitizedAddressId = orderData.addressId ? sanitizeUUID(String(orderData.addressId)) : null;

      orderDataToCreate = {
        userId: sanitizedUserId,
        orderType: orderData.orderType,
        status: orderData.status ?? 'pending',
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        paidAt: new Date(),
        templeId: sanitizedTempleId,
        addressId: sanitizedAddressId,
        scheduledDate: orderData.scheduledDate,
        scheduledTimestamp: orderData.scheduledTimestamp,
        fulfillmentType: orderData.fulfillmentType,
        subtotal: orderData.subtotal !== undefined ? String(orderData.subtotal) : undefined,
        discountAmount: orderData.discountAmount !== undefined ? String(orderData.discountAmount) : undefined,
        convenienceFee: orderData.convenienceFee !== undefined ? String(orderData.convenienceFee) : undefined,
        taxAmount: orderData.taxAmount !== undefined ? String(orderData.taxAmount) : undefined,
        totalAmount: orderData.totalAmount !== undefined ? String(orderData.totalAmount) : undefined,
        currency: orderData.currency || paymentOrderJson.currency,
        contactName: orderData.contactName,
        contactPhone: orderData.contactPhone,
        contactEmail: orderData.contactEmail || paymentOrderJson.customerEmail,
        shippingAddress: orderData.shippingAddress,
        deliveryType: orderData.deliveryType
      };

      if (paymentOrderJson.razorpayOrderId) {
        orderDataToCreate.paymentId = paymentOrderJson.razorpayOrderId;
      }

      createdOrder = await Order.create(orderDataToCreate);
      
      if (!createdOrder) {
        throw new Error('Order creation returned null/undefined');
      }
      
      const createdOrderJson = createdOrder.toJSON ? createdOrder.toJSON() : createdOrder;
      const finalOrderId = String(createdOrderJson.id);

      await paymentOrder.update({
        metadata: {
          ...(paymentOrderJson.metadata as Record<string, unknown> | undefined) ?? {},
          appOrderId: finalOrderId
        }
      } as any);

      console.log(`[WEBHOOK] [SUCCESS] Created Order ${finalOrderId} for PaymentOrder ${paymentOrderJson.razorpayOrderId}`);
    } catch (orderCreateError) {
      const error = orderCreateError as Error;
      console.error('[WEBHOOK] [ERROR] Failed to create Order:', error.message);
      console.error('[WEBHOOK] [ERROR] Order creation data:', {
        userId: orderDataToCreate.userId,
        templeId: orderDataToCreate.templeId,
        addressId: orderDataToCreate.addressId,
        paymentId: orderDataToCreate.paymentId,
        razorpayOrderId: paymentOrderJson.razorpayOrderId,
        originalUserId: orderData.userId,
        originalTempleId: orderData.templeId,
        originalAddressId: orderData.addressId,
      });
      reportError(orderCreateError);
      return null;
    }

    if (createdOrder && orderData.orderItems && Array.isArray(orderData.orderItems) && orderData.orderItems.length > 0) {
      const createdOrderJson = createdOrder.toJSON ? createdOrder.toJSON() : createdOrder;
      const orderId = String(createdOrderJson.id);
      
      const existingOrderItems = await OrderItem.findAll({ where: { orderId } });

      if (existingOrderItems.length === 0) {
        try {
          await Promise.all(
            orderData.orderItems.map(async (item: any) => {
              if (!item.itemType) {
                throw new Error(`OrderItem missing required field 'itemType': ${JSON.stringify(item)}`);
              }

              return await OrderItem.create({
                orderId: orderId,
                itemType: item.itemType,
                itemId: item.itemId ? sanitizeUUID(String(item.itemId)) : null,
                itemName: item.itemName || null,
                itemDescription: item.itemDescription || null,
                itemImageUrl: item.itemImageUrl || null,
                productId: item.productId ? sanitizeUUID(String(item.productId)) : null,
                pujaId: item.pujaId ? sanitizeUUID(String(item.pujaId)) : null,
                prasadId: item.prasadId ? sanitizeUUID(String(item.prasadId)) : null,
                dharshanId: item.dharshanId ? sanitizeUUID(String(item.dharshanId)) : null,
                quantity: item.quantity || null,
                unitPrice: item.unitPrice ? String(item.unitPrice) : null,
                totalPrice: item.totalPrice ? String(item.totalPrice) : null,
                itemDetails: item.itemDetails || null,
                status: item.status || null
              } as any);
            })
          );
        } catch (orderItemError) {
          console.error('[WEBHOOK] [ERROR] Failed to create orderItems:', orderItemError);
          reportError(orderItemError);
        }
      }
    }

    if (createdOrder) {
      const createdOrderJson = createdOrder.toJSON ? createdOrder.toJSON() : createdOrder;
      const orderId = String(createdOrderJson.id);

      const existingStatusHistory = await OrderStatusHistory.findOne({ where: { orderId } });

      if (!existingStatusHistory) {
        try {
          await OrderStatusHistory.create({
            orderId: orderId,
            status: orderData.status ?? 'pending',
            previousStatus: null,
            notes: 'Order created via Razorpay webhook',
            location: null
          } as any);
        } catch (statusHistoryError) {
          console.error('[WEBHOOK] [ERROR] Failed to create order status history:', statusHistoryError);
          reportError(statusHistoryError);
        }
      }
    }

    if (createdOrder && orderData.orderType === 'event' && orderData.rudrakshaBookingData) {
      try {
        const createdOrderJson = createdOrder.toJSON ? createdOrder.toJSON() : createdOrder;
        const orderId = String(createdOrderJson.id);

        const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
        if (appcontrolUrl && orderId) {
          const bookingPayload = {
            ...orderData.rudrakshaBookingData,
            orderId: orderId
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

          console.log(`[WEBHOOK] [SUCCESS] Created RudrakshaBooking for Order ${orderId}`);
        } else {
          console.warn('[WEBHOOK] [WARN] APPCONTROL_SERVICE_URL not configured; skipping RudrakshaBooking creation');
        }
      } catch (bookingError) {
        console.error('[WEBHOOK] [ERROR] Failed to create RudrakshaBooking:', bookingError);
        reportError(bookingError);
      }
    }

    if (createdOrder) {
      return createdOrder.toJSON ? createdOrder.toJSON() : createdOrder;
    }
    return null;
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

    const orderJson = order.toJSON ? order.toJSON() : order;

    if (orderJson.status === 'captured') {
      console.warn(`Payment ${body.paymentId} already captured`);
      res.status(200).json({
        message: 'Payment already captured',
        order: orderJson
      });
      return;
    }

    const client = getRazorpayClient();
    const captureAmount = body.amount
      ? toMinorUnits(body.amount)
      : orderJson.amount;

    if (!captureAmount) {
      res.status(400).json({
        message: 'Amount is required when the payment amount is unknown'
      });
      return;
    }

    const captureResponse = await client.payments.capture(
      body.paymentId,
      captureAmount,
      (body.currency ?? orderJson.currency ?? 'INR').toUpperCase()
    );

    await order.update({
      status: 'captured',
      capturedAt: fromUnixTimestamp((captureResponse as any).captured_at),
      amount: Number(captureResponse.amount),
      failureReason: undefined
    } as any);

    const updatedOrder = await PaymentOrder.findOne({
      where: { razorpayPaymentId: body.paymentId }
    });

    const updatedOrderJson = updatedOrder?.toJSON ? updatedOrder.toJSON() : updatedOrder;

    console.log(`Payment ${body.paymentId} captured successfully`);
    res.status(200).json({
      message: 'Payment captured successfully',
      capture: captureResponse,
      order: updatedOrderJson
    });
  } catch (error) {
    console.error('capturePaymentHandler error:', error);
    const errorMessage = (error as Error).message;

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
      console.warn(`[WEBHOOK] Order not found for payment ${paymentEntity.id}`);
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;
    const metadata = (orderJson.metadata as Record<string, unknown> | undefined) ?? {};

    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'authorized',
      amount: paymentEntity.amount,
      failureReason: undefined,
      metadata: {
        ...metadata,
        razorpayPaymentEntity: paymentEntity,
        authorizedAt: new Date().toISOString()
      }
    } as any);

    console.log(`[WEBHOOK] Payment ${paymentEntity.id} authorized for order ${paymentEntity.order_id}`);
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment authorized event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

async function handlePaymentCaptured(paymentEntity: RazorpayPaymentEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: paymentEntity.order_id }
    });

    if (!order) {
      console.warn(`[WEBHOOK] Order not found for payment ${paymentEntity.id}`);
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;
    const metadata = (orderJson.metadata as Record<string, unknown> | undefined) ?? {};
    const orderData = metadata.orderData as any;
    const existingAppOrderId = metadata.appOrderId as string | undefined;

    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'captured',
      amount: paymentEntity.amount,
      capturedAt: fromUnixTimestamp(paymentEntity.captured_at),
      failureReason: undefined,
      metadata: {
        ...metadata,
        razorpayPaymentEntity: paymentEntity,
        capturedAt: new Date().toISOString()
      }
    } as any);

    console.log(`[WEBHOOK] Payment ${paymentEntity.id} captured for order ${paymentEntity.order_id}`);

    if (!existingAppOrderId && orderData && orderData.userId && orderData.orderType) {
      try {
        console.log(`[WEBHOOK] Creating Order from webhook for payment ${paymentEntity.id}`);
        const refreshedOrder = await PaymentOrder.findOne({
          where: { razorpayOrderId: paymentEntity.order_id }
        });
        if (refreshedOrder) {
          await createOrderFromPaymentOrderData(refreshedOrder, orderData, undefined);
          console.log(`[WEBHOOK] Successfully created Order from webhook for payment ${paymentEntity.id}`);
        }
      } catch (orderCreateError) {
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
      console.warn(`[WEBHOOK] Order not found for payment ${paymentEntity.id}`);
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;
    const metadata = (orderJson.metadata as Record<string, unknown> | undefined) ?? {};

    await order.update({
      razorpayPaymentId: paymentEntity.id,
      status: 'failed',
      amount: paymentEntity.amount,
      failureReason: paymentEntity.error_description || 'Payment failed',
      metadata: {
        ...metadata,
        razorpayPaymentEntity: paymentEntity,
        failedAt: new Date().toISOString()
      }
    } as any);

    console.log(`[WEBHOOK] Payment ${paymentEntity.id} failed for order ${paymentEntity.order_id}: ${paymentEntity.error_description}`);
  } catch (error) {
    console.error('[WEBHOOK] Error handling payment failed event:', error);
    throw new Error(WEBHOOK_PAYMENT_UPDATE_FAILED);
  }
}

async function handleOrderPaid(orderEntity: RazorpayOrderEntity): Promise<void> {
  try {
    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: orderEntity.id }
    });

    if (!order) {
      console.warn(`[WEBHOOK] Order not found: ${orderEntity.id}`);
      return;
    }

    const orderJson = order.toJSON ? order.toJSON() : order;
    const metadata = (orderJson.metadata as Record<string, unknown> | undefined) ?? {};
    const orderData = metadata.orderData as any;
    const existingAppOrderId = metadata.appOrderId as string | undefined;

    if (orderJson.status !== 'captured') {
      await order.update({
        status: 'paid',
        metadata: {
          ...metadata,
          razorpayOrderEntity: orderEntity,
          paidAt: new Date().toISOString()
        }
      } as any);
    }

    console.log(`[WEBHOOK] Order ${orderEntity.id} marked as paid`);

    if (!existingAppOrderId && orderData && orderData.userId && orderData.orderType) {
      try {
        console.log(`[WEBHOOK] Creating Order from webhook for Razorpay order ${orderEntity.id}`);
        const refreshedOrder = await PaymentOrder.findOne({
          where: { razorpayOrderId: orderEntity.id }
        });
        if (refreshedOrder) {
          await createOrderFromPaymentOrderData(refreshedOrder, orderData, undefined);
          console.log(`[WEBHOOK] Successfully created Order from webhook for Razorpay order ${orderEntity.id}`);
        }
      } catch (orderCreateError) {
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
    const signatureHeader = req.headers['x-razorpay-signature'] || 
                           req.headers['X-Razorpay-Signature'] ||
                           (req.headers as any)['x-razorpay-signature'];
    
    const signature = typeof signatureHeader === 'string' 
      ? signatureHeader 
      : Array.isArray(signatureHeader) 
        ? signatureHeader[0] 
        : null;

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      if (!signature) {
        console.warn('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is configured but signature header is missing');
        console.warn('[WEBHOOK] This may indicate webhook is not properly configured in Razorpay dashboard');
        res.status(400).json({ 
          message: WEBHOOK_SIGNATURE_INVALID,
          error: 'Webhook signature header missing. Configure webhook secret in Razorpay dashboard.'
        });
        return;
      }

      if (!verifyWebhookSignature(rawBody, signature)) {
        console.error('[WEBHOOK] Invalid webhook signature');
        res.status(400).json({ message: WEBHOOK_SIGNATURE_INVALID });
        return;
      }
    } else {
      if (!signature) {
        console.warn('[WEBHOOK] No webhook secret configured - processing webhook without signature verification');
        console.warn('[WEBHOOK] WARNING: This is insecure. Configure RAZORPAY_WEBHOOK_SECRET for production.');
      } else {
        console.warn('[WEBHOOK] Signature header present but RAZORPAY_WEBHOOK_SECRET not configured - skipping verification');
      }
    }

    const payload = req.body as RazorpayWebhookPayload;

    if (!payload.event || !payload.payload) {
      console.error('[WEBHOOK] Invalid payload structure');
      res.status(400).json({ message: WEBHOOK_PAYLOAD_INVALID });
      return;
    }

    console.log(`[WEBHOOK] Processing webhook event: ${payload.event}`);

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
          console.log(`[WEBHOOK] Refund event received: ${payload.event}`);
          break;

        default:
          console.warn(`[WEBHOOK] Unsupported webhook event: ${payload.event}`);
          res.status(200).json({
            message: WEBHOOK_EVENT_UNSUPPORTED,
            event: payload.event
          });
          return;
      }

      console.log(`[WEBHOOK] Successfully processed event: ${payload.event}`);
      res.status(200).json({
        message: 'Webhook processed successfully',
        event: payload.event
      });

    } catch (processingError) {
      console.error('[WEBHOOK] Error processing webhook:', processingError);
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



