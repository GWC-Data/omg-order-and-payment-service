/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EndpointAuthType,
  EndpointHandler,
  EndpointRequestType
} from 'node-server-engine';
import { Response } from 'express';
import { PaymentOrder, PaymentStatus, Order, OrderItem, OrderStatusHistory } from 'db/models';
import { randomUUID } from 'crypto';
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
  RAZORPAY_EVENT_REFUND_PROCESSED
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

    const order = await PaymentOrder.findOne({
      where: { razorpayOrderId: body.razorpay_order_id }
    });

    if (!order) {
      console.error(`Order not found: ${body.razorpay_order_id}`);
      res.status(404).json({ message: PAYMENT_ORDER_NOT_FOUND });
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

    // Create app Order (idempotent using PaymentOrder.metadata.appOrderId)
    const metadata = (order.metadata as Record<string, unknown> | undefined) ?? {};
    const existingAppOrderId = (metadata as any).appOrderId as string | undefined;
    let createdOrder: Order | null = null;
    
    if (!existingAppOrderId) {
      try {
        createdOrder = await Order.create({
          // Ensure orderNumber is always set (extra safety). [[memory:12523883]]
          orderNumber: randomUUID(),
          userId: body?.userId ?? null,
          templeId: body?.templeId ?? null,
          addressId: body.addressId,
          orderType: body.orderType,
          status: (body.status as any) ?? 'pending',
          scheduledDate: body.scheduledDate,
          scheduledTimestamp: body.scheduledTimestamp,
          fulfillmentType: body.fulfillmentType,
          subtotal: body.subtotal,
          discountAmount: body.discountAmount,
          convenienceFee: body.convenienceFee,
          taxAmount: body.taxAmount,
          totalAmount: body.totalAmount,
          currency: body.currency ?? order.currency,
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          paidAt: new Date(),
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail ?? order.customerEmail,
          shippingAddress: body.shippingAddress,
          deliveryType: body.deliveryType
        } as any);
      } catch (orderCreateError) {
        console.error('Error creating Order:', orderCreateError);
        console.error('Order creation error details:', {
          message: (orderCreateError as Error).message,
          name: (orderCreateError as Error).name,
          stack: (orderCreateError as Error).stack
        });
        // Re-throw with more context
        throw new Error(`Failed to create order: ${(orderCreateError as Error).message}`);
      }

      await order.update({
        metadata: {
          ...metadata,
          appOrderId: createdOrder.id,
          razorpayPaymentId: body.razorpay_payment_id
        }
      } as any);
    } else {
      // Fetch existing order if it was already created
      createdOrder = await Order.findByPk(existingAppOrderId);
    }

    // Create OrderItems if provided and order exists
    let createdOrderItems: OrderItem[] = [];
    if (createdOrder && body.orderItems && Array.isArray(body.orderItems) && body.orderItems.length > 0) {
      // Check if orderItems already exist for this order (idempotency)
      const existingOrderItems = await OrderItem.findAll({
        where: { orderId: createdOrder.id }
      });

      // Only create orderItems if they don't already exist
      if (existingOrderItems.length === 0) {
        try {
          // Create all orderItems
          const orderItemsToCreate = body.orderItems.map((item) => ({
            id: randomUUID(),
            orderId: createdOrder!.id,
            itemType: item.itemType,
            itemId: item.itemId,
            itemName: item.itemName,
            itemDescription: item.itemDescription,
            itemImageUrl: item.itemImageUrl,
            productId: item.productId,
            pujaId: item.pujaId,
            prasadId: item.prasadId,
            dharshanId: item.dharshanId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            itemDetails: item.itemDetails,
            status: item.status
          }));

          createdOrderItems = await OrderItem.bulkCreate(orderItemsToCreate as any);
          console.log(`Created ${createdOrderItems.length} orderItems for order ${createdOrder.id}`);
        } catch (orderItemError) {
          console.error('Error creating orderItems:', orderItemError);
          // Log error but don't fail the payment verification
          // The order is already created, so we continue
        }
      } else {
        console.log(`OrderItems already exist for order ${createdOrder.id}, skipping creation`);
        createdOrderItems = existingOrderItems;
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
    const errorMessage = (error as Error).message || String(error);
    const errorStack = (error as Error).stack;
    
    console.error('verifyPaymentSignatureHandler error:', errorMessage);
    console.error('Error stack:', errorStack);
    console.error('Request body:', JSON.stringify(body, null, 2));
    console.error('Full error object:', error);
    
    // Always return detailed error in response for debugging
    res.status(500).json({
      message: 'Unable to verify payment signature',
      error: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        name: (error as Error).name,
        body: body
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



