import { PaymentStatus } from 'db/models/PaymentOrder';

export interface CreatePaymentOrderBody {
  amount: number;
  currency?: string;
  userId?: string;
  receipt?: string;
  notes?: Record<string, string>;
  metadata?: Record<string, unknown>;
  customerEmail?: string;
  customerPhone?: string;
  autoCapture?: boolean;
}

export interface OrderItemInput {
  itemType: string;
  itemId?: string;
  itemName?: string;
  itemDescription?: string;
  itemImageUrl?: string;
  productId?: string;
  pujaId?: string;
  prasadId?: string;
  dharshanId?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  itemDetails?: Record<string, unknown>;
  status?: string;
}

export interface RudrakshaBookingData {
  userId: string;
  fullName: string;
  phoneNumber: string;
  addressText: string;
  addressPlaceId?: string;
  addressLat?: number;
  addressLng?: number;
  age?: number;
  gender: string;
  participatingInEvent: boolean;
  preferredDate?: string;
  preferredTimeSlot?: string;
  numberOfPeople?: number;
  members?: Array<{
    idName: string;
    idAge?: number;
    idGender: string;
  }>;
  rudrakshaQuantity: number;
}

export interface VerifyPaymentBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;

  // Order details (used to create the app Order after payment is verified)
  userId: string;
  templeId?: string;
  addressId?: string;
  orderType: 'darshan' | 'puja' | 'prasad' | 'product';
  status?: string;
  scheduledDate?: string;
  scheduledTimestamp?: string;
  fulfillmentType?: 'pickup' | 'delivery' | 'in_person' | 'digital';
  subtotal?: number;
  discountAmount?: number;
  convenienceFee?: number;
  taxAmount?: number;
  totalAmount?: number;
  currency?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  shippingAddress?: string;
  deliveryType?: 'standard' | 'express';
  orderItems?: OrderItemInput[];
  
  // Rudraksha booking data (optional, only for rudraksha bookings)
  rudrakshaBookingData?: RudrakshaBookingData;
}

export interface CapturePaymentBody {
  paymentId: string;
  amount?: number;
  currency?: string;
}

export interface ListPaymentsQuery {
  status?: PaymentStatus;
  page?: number;
  pageSize?: number;
  userId?: string;
}

// Webhook related types
export interface RazorpayWebhookPayload {
  event: string;
  account_id: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrderEntity;
    };
    refund?: {
      entity: RazorpayRefundEntity;
    };
  };
  created_at: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  invoice_id?: string;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status?: string;
  captured: boolean;
  description?: string;
  card_id?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email: string;
  contact: string;
  notes: Record<string, string>;
  fee: number;
  tax: number;
  error_code?: string;
  error_description?: string;
  created_at: number;
  captured_at?: number;
  acquirer_data?: {
    rrn?: string;
    upi_transaction_id?: string;
  };
}

export interface RazorpayOrderEntity {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt?: string;
  offer_id?: string;
  status: string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayRefundEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  payment_id: string;
  notes: Record<string, string>;
  created_at: number;
}

export interface WebhookVerificationBody {
  payload: RazorpayWebhookPayload;
  signature: string;
}


