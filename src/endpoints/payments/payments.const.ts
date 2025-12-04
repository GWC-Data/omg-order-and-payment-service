export const PAYMENT_ORDER_CREATION_FAILED =
  'Failed to create the Razorpay order.';
export const PAYMENT_ORDER_NOT_FOUND = 'Payment order not found.';
export const PAYMENT_ORDER_ALREADY_PROCESSED =
  'Payment order is already processed.';
export const PAYMENT_SIGNATURE_INVALID =
  'Razorpay payment signature verification failed.';
export const PAYMENT_CAPTURE_FAILED = 'Failed to capture Razorpay payment.';
export const PAYMENT_DETAILS_FETCH_FAILED =
  'Unable to fetch Razorpay payment details.';
export const USER_ID_REQUIRED = 'User identifier (userId) is required.';

// Webhook related constants
export const WEBHOOK_SIGNATURE_INVALID = 'Webhook signature verification failed.';
export const WEBHOOK_PAYLOAD_INVALID = 'Invalid webhook payload.';
export const WEBHOOK_PROCESSING_FAILED = 'Failed to process webhook event.';
export const WEBHOOK_EVENT_UNSUPPORTED = 'Unsupported webhook event type.';
export const WEBHOOK_PAYMENT_UPDATE_FAILED = 'Failed to update payment status from webhook.';
export const WEBHOOK_DUPLICATE_EVENT = 'Duplicate webhook event ignored.';

// Razorpay webhook event types
export const RAZORPAY_EVENT_PAYMENT_AUTHORIZED = 'payment.authorized';
export const RAZORPAY_EVENT_PAYMENT_CAPTURED = 'payment.captured';
export const RAZORPAY_EVENT_PAYMENT_FAILED = 'payment.failed';
export const RAZORPAY_EVENT_ORDER_PAID = 'order.paid';
export const RAZORPAY_EVENT_REFUND_CREATED = 'refund.created';
export const RAZORPAY_EVENT_REFUND_PROCESSED = 'refund.processed';


