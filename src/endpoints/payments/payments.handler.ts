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

    // Validate required fields before creating Order
    if (!body.userId) {
      console.error('[ERROR] userId is required but missing in request body');
      res.status(400).json({ 
        message: 'User ID is required to create order',
        error: 'userId is missing from request body'
      });
      return;
    }

    if (!body.orderType) {
      console.error('[ERROR] orderType is required but missing in request body');
      res.status(400).json({ 
        message: 'Order type is required to create order',
        error: 'orderType is missing from request body'
      });
      return;
    }

    // Check for duplicate Rudraksha booking if orderType is 'event' and booking data is provided
    if (body.orderType === 'event' && body.rudrakshaBookingData) {
      const bookingData = body.rudrakshaBookingData;
      if (bookingData.preferredDate && bookingData.preferredTimeSlot) {
        try {
          const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
          if (appcontrolUrl) {
            const accessToken = req.headers.authorization;
            
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
              const normalizedPreferredDate = bookingData.preferredDate.includes('T')
                ? bookingData.preferredDate.split('T')[0]
                : bookingData.preferredDate;

              const duplicateBooking = existingBookings.find((booking: any) => {
                const existingDate = booking.preferredDate 
                  ? (booking.preferredDate.includes('T') ? booking.preferredDate.split('T')[0] : booking.preferredDate)
                  : null;
                return (
                  existingDate === normalizedPreferredDate &&
                  booking.preferredTimeSlot === bookingData.preferredTimeSlot
                );
              });

              if (duplicateBooking) {
                console.warn(`[DUPLICATE_BOOKING] User ${bookingData.userId} already has a booking for date ${normalizedPreferredDate} and time slot ${bookingData.preferredTimeSlot}`);
                res.status(400).json({
                  message: DUPLICATE_RUDRAKSHA_BOOKING_ERROR,
                  error: 'DUPLICATE_BOOKING_ERROR'
                });
                return;
              }
            }
          } else {
            console.warn('[WARN] APPCONTROL_SERVICE_URL not configured; skipping duplicate booking check');
          }
        } catch (duplicateCheckError) {
          // Log error but don't fail payment verification - best-effort validation
          console.error('[ERROR] Failed to check for duplicate booking:', duplicateCheckError);
          reportError(duplicateCheckError);
          // Continue with order creation even if duplicate check fails
        }
      }
    }

    // Create app Order (idempotent using PaymentOrder.metadata.appOrderId)
    const metadata = (order.metadata as Record<string, unknown> | undefined) ?? {};
    const existingAppOrderId = (metadata as any).appOrderId as string | undefined;
    const bookingId = (metadata as any).bookingId as string | undefined; // Extract bookingId from PaymentOrder metadata
    let createdOrder: Order | null = null;
    
    if (!existingAppOrderId) {
      try {
        // Prepare order data with all required fields
        const orderData: any = {
          // Ensure orderNumber is always set (extra safety). [[memory:12523883]]
          orderNumber: randomUUID(),
          userId: body.userId, // Required - validated above
          orderType: body.orderType, // Required - validated above
          status: (body.status as any) ?? 'pending',
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          paidAt: new Date()
        };
        
        // Store bookingId in Order metadata if present
        if (bookingId) {
          orderData.metadata = { bookingId };
        }

        // Add optional fields only if they exist
        if (body.templeId) orderData.templeId = body.templeId;
        if (body.addressId) orderData.addressId = body.addressId;
        if (body.scheduledDate) orderData.scheduledDate = body.scheduledDate;
        if (body.scheduledTimestamp) orderData.scheduledTimestamp = body.scheduledTimestamp;
        if (body.fulfillmentType) orderData.fulfillmentType = body.fulfillmentType;
        if (body.subtotal !== undefined) orderData.subtotal = String(body.subtotal);
        if (body.discountAmount !== undefined) orderData.discountAmount = String(body.discountAmount);
        if (body.convenienceFee !== undefined) orderData.convenienceFee = String(body.convenienceFee);
        if (body.taxAmount !== undefined) orderData.taxAmount = String(body.taxAmount);
        if (body.totalAmount !== undefined) orderData.totalAmount = String(body.totalAmount);
        if (body.currency) orderData.currency = body.currency;
        else if (order.currency) orderData.currency = order.currency;
        if (body.contactName) orderData.contactName = body.contactName;
        if (body.contactPhone) orderData.contactPhone = body.contactPhone;
        if (body.contactEmail) orderData.contactEmail = body.contactEmail;
        else if (order.customerEmail) orderData.contactEmail = order.customerEmail;
        if (body.shippingAddress) orderData.shippingAddress = body.shippingAddress;
        if (body.deliveryType) orderData.deliveryType = body.deliveryType;

        console.log('[DEBUG] Creating Order with data:', {
          userId: orderData.userId,
          orderType: orderData.orderType,
          status: orderData.status,
          paymentStatus: orderData.paymentStatus
        });

        // Explicitly set id (UUID generation) - this ensures we have the id immediately
        const orderId = randomUUID();
        orderData.id = orderId;

        createdOrder = await Order.create(orderData);
        
        // Verify order was created
        if (!createdOrder) {
          throw new Error('Order creation returned null/undefined');
        }
        
        // Ensure id is accessible - use the one we set if model doesn't have it
        // This handles cases where Sequelize doesn't return the id immediately
        if (!createdOrder.id) {
          (createdOrder as any).id = orderId;
          console.warn('[WARN] Order.id was not set by Sequelize, using generated id');
        }
        
        console.log(`[SUCCESS] Created Order ${createdOrder.id} for PaymentOrder ${body.razorpay_order_id}`);
      } catch (orderCreateError) {
        const error = orderCreateError as Error;
        console.error('[ERROR] Failed to create Order:', error.message);
        console.error('[ERROR] Order creation error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          orderData: {
            userId: body.userId,
            orderType: body.orderType,
            status: (body.status as any) ?? 'pending'
          }
        });
        
        // Check for specific database errors
        if (error.message.includes('null value') || error.message.includes('NOT NULL')) {
          throw new Error(`Database constraint violation: ${error.message}. Check that all required fields are provided.`);
        }
        if (error.message.includes('violates foreign key') || error.message.includes('FOREIGN KEY')) {
          throw new Error(`Foreign key violation: ${error.message}. Check that userId, templeId, or addressId exist in their respective tables.`);
        }
        if (error.message.includes('duplicate key') || error.message.includes('UNIQUE')) {
          throw new Error(`Duplicate key violation: ${error.message}. Order may already exist.`);
        }
        
        // Re-throw with more context
        throw new Error(`Failed to create order: ${error.message}`);
      }

      await order.update({
        metadata: {
          ...metadata,
          appOrderId: createdOrder.id,
          razorpayPaymentId: body.razorpay_payment_id
        }
      } as any);

      // Create RudrakshaBooking only if orderType is "event" and booking data is provided (best-effort, don't fail payment verification)
      if (body.orderType === 'event' && body.rudrakshaBookingData && createdOrder.id) {
        try {
          const appcontrolUrl = process.env.APPCONTROL_SERVICE_URL;
          if (appcontrolUrl) {
            const bookingPayload = {
              ...body.rudrakshaBookingData,
              orderId: createdOrder.id
            };

            // Get access token from request headers if available
            const accessToken = req.headers.authorization;

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

            console.log(`[SUCCESS] Created RudrakshaBooking for Order ${createdOrder.id}`);
          } else {
            console.warn('[WARN] APPCONTROL_SERVICE_URL not configured; skipping RudrakshaBooking creation');
          }
        } catch (bookingError) {
          // Best-effort: log error but don't fail payment verification
          console.error('[ERROR] Failed to create RudrakshaBooking:', bookingError);
          reportError(bookingError);
        }
      }
    } else {
      // Fetch existing order if it was already created
      createdOrder = await Order.findByPk(existingAppOrderId);
    }

    // Create OrderItems if provided and order exists
    let createdOrderItems: OrderItem[] = [];
    
    // Log orderItems creation attempt status
    console.log('[DEBUG] OrderItems creation check:', {
      hasCreatedOrder: !!createdOrder,
      hasOrderItems: !!body.orderItems,
      isOrderItemsArray: Array.isArray(body.orderItems),
      orderItemsLength: body.orderItems?.length || 0,
      orderId: createdOrder?.id || 'N/A'
    });

    if (createdOrder && body.orderItems && Array.isArray(body.orderItems) && body.orderItems.length > 0) {
      // Ensure createdOrder has an id - extract it properly
      const orderId = String(createdOrder.get ? createdOrder.get('id') : (createdOrder as any).dataValues?.id || createdOrder.id);
      
      if (!orderId || orderId === 'undefined' || orderId === 'null') {
        console.error('[ERROR] Created Order has no valid id, cannot create OrderItems', {
          orderId,
          createdOrderId: createdOrder.id,
          createdOrderDataValues: (createdOrder as any).dataValues
        });
        throw new Error('Order was created but id is missing or invalid');
      }

      console.log(`[DEBUG] Creating OrderItems for order ${orderId}`, {
        orderItemsCount: body.orderItems.length,
        orderItems: body.orderItems.map(item => ({
          itemType: item.itemType,
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity
        }))
      });
      
      // Check if orderItems already exist for this order (idempotency)
      const existingOrderItems = await OrderItem.findAll({
        where: { orderId }
      });

      console.log(`[DEBUG] Existing OrderItems check for order ${orderId}:`, {
        existingCount: existingOrderItems.length
      });

      // Only create orderItems if they don't already exist
      if (existingOrderItems.length === 0) {
        try {
          // Create all orderItems using individual create() calls (bulkCreate has issues with UUIDs in PostgreSQL)
          // This matches the pattern used in orderItem.handler.ts
          console.log(`[DEBUG] Attempting to create ${body.orderItems.length} OrderItems for order ${orderId}`);
          
          createdOrderItems = await Promise.all(
            body.orderItems.map(async (item) => {
              // Validate required fields
              if (!item.itemType) {
                throw new Error(`OrderItem missing required field 'itemType': ${JSON.stringify(item)}`);
              }

              // Use individual create() call with id: randomUUID() - same pattern as orderItem.handler.ts
              return await OrderItem.create({
                // Some environments don't end up with a DB-side UUID default; generate it here to avoid NULL id inserts.
                id: randomUUID(),
                orderId: orderId, // Explicitly use the string-converted orderId
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
          
          console.log(`[SUCCESS] Created ${createdOrderItems.length} orderItems for order ${orderId}`);
        } catch (orderItemError) {
          const error = orderItemError as Error;
          console.error('[ERROR] Failed to create orderItems:', {
            error: error.message,
            stack: error.stack,
            orderId,
            orderItemsCount: body.orderItems.length,
            orderItems: body.orderItems,
            errorName: error.name
          });
          reportError(orderItemError);
          // Log error but don't fail the payment verification
          // The order is already created, so we continue
        }
      } else {
        console.log(`[INFO] OrderItems already exist for order ${orderId}, skipping creation. Using existing ${existingOrderItems.length} items.`);
        createdOrderItems = existingOrderItems;
      }
    } else {
      // Log why orderItems are not being created
      if (!createdOrder) {
        console.log('[INFO] OrderItems not created: createdOrder is null/undefined');
      } else if (!body.orderItems) {
        console.log('[INFO] OrderItems not created: body.orderItems is missing');
      } else if (!Array.isArray(body.orderItems)) {
        console.log('[INFO] OrderItems not created: body.orderItems is not an array', {
          type: typeof body.orderItems,
          value: body.orderItems
        });
      } else if (body.orderItems.length === 0) {
        console.log('[INFO] OrderItems not created: body.orderItems array is empty');
      }
    }

    // Create initial OrderStatusHistory if order exists and status history doesn't exist
    let createdStatusHistory: OrderStatusHistory | null = null;
    if (createdOrder) {
      // Check if status history already exists for this order (idempotency)
      const existingStatusHistory = await OrderStatusHistory.findOne({
        where: { orderId: createdOrder.id }
      });

      if (!existingStatusHistory) {
        try {
          const initialStatus = (body.status as any) ?? 'pending';
          createdStatusHistory = await OrderStatusHistory.create({
            id: randomUUID(),
            orderId: createdOrder.id,
            status: initialStatus,
            previousStatus: null,
            notes: 'Order created via payment verification',
            location: null
          } as any);
          console.log(`Created initial order status history for order ${createdOrder.id} with status: ${initialStatus}`);
        } catch (statusHistoryError) {
          console.error('Error creating order status history:', statusHistoryError);
          // Log error but don't fail the payment verification
          // The order is already created, so we continue
        }
      } else {
        console.log(`Order status history already exists for order ${createdOrder.id}, skipping creation`);
        createdStatusHistory = existingStatusHistory;
      }
    }

    console.log(`Payment verified successfully for order ${body.razorpay_order_id}`);
    res.status(200).json({
      message: 'Payment verified successfully',
      order,
      appOrderId: ((order.metadata as any)?.appOrderId as string | undefined),
      orderItems: createdOrderItems.length > 0 ? createdOrderItems : undefined,
      orderStatusHistory: createdStatusHistory ? [createdStatusHistory] : undefined
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

    console.log(`Payment ${paymentEntity.id} captured for order ${paymentEntity.order_id}`);
  } catch (error) {
    console.error('Error handling payment captured event:', error);
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

    console.log(`Order ${orderEntity.id} marked as paid`);
  } catch (error) {
    console.error('Error handling order paid event:', error);
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



