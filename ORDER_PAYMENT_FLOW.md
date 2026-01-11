# Order & Payment System - Flow Documentation

## Architecture Overview

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│ Flutter App │────────▶│ Payment Service  │────────▶│   Razorpay   │
│             │◀────────│   (Backend API)  │◀────────│   Gateway    │
└─────────────┘         └──────────────────┘         └──────────────┘
                               │
                               │ Webhooks
                               ▼
                        ┌──────────────┐
                        │ Order Service│
                        │  (Backend)   │
                        └──────────────┘
```

## Core Entities

- **PaymentOrder**: Razorpay payment order (before payment)
- **Order**: Application order (after successful payment)
- **OrderItem**: Items in an order (products/puja/prasad)
- **OrderStatusHistory**: Order status change tracking

---

## Flow 1: Payment Order Creation (Flutter App → Backend)

### Step-by-Step Flow:

```
1. Flutter App
   │
   ├─▶ POST /payments/orders
   │   Body: {
   │     userId, amount, currency,
   │     receipt, notes, metadata
   │   }
   │   Headers: Authorization: Bearer <JWT>
   │
   ▼
2. Backend (createPaymentOrderHandler)
   │
   ├─▶ Creates Razorpay Order via Razorpay SDK
   │   └─▶ Razorpay API returns: razorpay_order_id
   │
   ├─▶ Saves PaymentOrder in Database
   │   └─▶ Status: 'created'
   │   └─▶ razorpayOrderId: <razorpay_order_id>
   │   └─▶ userId, amount, currency stored
   │
   ▼
3. Response to Flutter App
   │
   └─▶ Returns: {
         order: <razorpay_order_data>,
         record: <payment_order_record>
       }
```

### Flutter Integration:
```dart
// Create payment order
final response = await http.post(
  Uri.parse('$baseUrl/payments/orders'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'userId': userId,
    'amount': 50000, // in paise (500.00 INR)
    'currency': 'INR',
    'receipt': 'receipt_123',
    'notes': {'order_type': 'product'},
  }),
);

final data = jsonDecode(response.body);
final razorpayOrderId = data['order']['id'];
final paymentOrderId = data['record']['id'];
```

---

## Flow 2: Payment Verification (Flutter App → Razorpay → Backend)

### UX Strategy: Immediate Order Creation for Better User Experience

**The verify API is designed for IMMEDIATE UX feedback:**
- ✅ Creates order instantly after payment (best UX)
- ✅ Returns orderId in response (user sees success immediately)
- ✅ Webhooks act as backup (safety net)

**Dual Strategy:**
1. **Primary**: Verify API creates order immediately (synchronous)
2. **Backup**: Webhooks create order if verify fails (asynchronous)

### Step-by-Step Flow:

```
1. Flutter App
   │
   ├─▶ Opens Razorpay Checkout
   │   └─▶ Uses razorpay_order_id from Step 1
   │   └─▶ User enters payment details
   │   └─▶ User completes payment
   │
   ▼
2. Razorpay Payment Gateway
   │
   ├─▶ Processes Payment
   │   └─▶ Returns: {
   │         razorpay_order_id,
   │         razorpay_payment_id,
   │         razorpay_signature
   │       }
   │
   ▼
3. Flutter App (IMMEDIATELY calls verify)
   │
   ├─▶ POST /payments/verify
   │   Body: {
   │     razorpay_order_id,
   │     razorpay_payment_id,
   │     razorpay_signature,
   │     userId, orderType, orderItems,
   │     subtotal, totalAmount, addressId, etc.
   │   }
   │   Headers: Authorization: Bearer <JWT>
   │
   │   ⚡ UX GOAL: Get immediate response with orderId
   │
   ▼
4. Backend (verifyPaymentSignatureHandler)
   │
   ├─▶ Verifies Signature (cryptographic verification)
   │   └─▶ Uses Razorpay webhook secret
   │
   ├─▶ Finds PaymentOrder by razorpayOrderId
   │
   ├─▶ Updates PaymentOrder
   │   └─▶ Status: 'paid'
   │   └─▶ razorpayPaymentId: <payment_id>
   │   └─▶ Stores orderData in metadata
   │
   ├─▶ ⚡ IMMEDIATELY Creates Order (UX optimization)
   │   ├─▶ Order table (with id, orderNumber auto-generated)
   │   ├─▶ OrderItems (multiple items)
   │   ├─▶ OrderStatusHistory (initial status)
   │   ├─▶ RudrakshaBooking (if event type)
   │   └─▶ Updates PaymentOrder.metadata.appOrderId
   │
   ▼
5. Response to Flutter App
   │
   └─▶ Returns: {
         message: "Payment verified and order created successfully",
         order: <payment_order>,
         appOrderId: <order_id>,  ⚡ IMMEDIATE orderId for UX
         status: "verified"
       }
   
   ✅ USER SEES: Order Success Page with orderId immediately
   ✅ NO WAITING: User doesn't wait for webhook (which may be delayed)
```

### Flutter Integration (Recommended UX Flow):

```dart
// ⚡ OPTIMIZED UX: Immediate order creation via verify API
void _handlePaymentSuccess(PaymentSuccessResponse response) async {
  try {
    // Show loading indicator
    showLoadingDialog('Processing your order...');
    
    // Immediately call verify API (for best UX)
    final verifyResponse = await http.post(
      Uri.parse('$baseUrl/payments/verify'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'razorpay_order_id': response.orderId!,
        'razorpay_payment_id': response.paymentId!,
        'razorpay_signature': response.signature!,
        'userId': currentUserId,
        'orderType': selectedOrderType,
        'orderItems': cartItems.map((item) => {
          'itemType': 'product',
          'productId': item.productId,
          'quantity': item.quantity,
          'unitPrice': (item.price * 100).toInt(),
          'totalPrice': (item.totalPrice * 100).toInt(),
        }).toList(),
        'subtotal': (cartSubtotal * 100).toInt(),
        'totalAmount': (cartTotal * 100).toInt(),
        'addressId': selectedAddressId,
        'currency': 'INR',
      }),
    );

    hideLoadingDialog();

    if (verifyResponse.statusCode == 200) {
      final data = jsonDecode(verifyResponse.body);
      
      // ✅ BEST CASE: Order created immediately
      if (data['appOrderId'] != null) {
        final orderId = data['appOrderId'];
        
        // Navigate to success page immediately
        Navigator.pushReplacementNamed(
          context,
          '/order-success',
          arguments: {'orderId': orderId},
        );
        
        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order placed successfully!')),
        );
        
        return; // ✅ UX: Immediate feedback - user happy
      }
      
      // ⚠️ FALLBACK: Order will be created via webhook
      // (Rare case - usually order is created immediately)
      _handleDelayedOrderCreation(response.orderId!);
      
    } else {
      // Payment verified but order creation failed
      _handleVerificationError(verifyResponse);
    }
    
  } catch (e) {
    hideLoadingDialog();
    // Network error - webhook will handle it
    _handleNetworkError(response.orderId!);
  }
}

// Fallback: Handle delayed order creation (webhook backup)
void _handleDelayedOrderCreation(String razorpayOrderId) async {
  // Show message to user
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text('Payment successful! Your order is being processed...'),
      duration: Duration(seconds: 5),
    ),
  );
  
  // Navigate to pending/processing page
  Navigator.pushReplacementNamed(
    context,
    '/payment-pending',
    arguments: {'razorpayOrderId': razorpayOrderId},
  );
  
  // Optional: Poll for order (or let webhook handle it)
  // User can check orders list later
}
```

---

## Flow 3: Webhook Flow (Razorpay → Backend)

### Why Webhooks? (Backup Safety Net)

**Webhooks are a BACKUP mechanism** - they ensure order creation in edge cases:

⚠️ **Edge Cases Where Webhooks Save the Day:**
- Flutter app crashes after payment (before calling verify)
- Network fails during `/payments/verify` call
- User closes app before verification completes
- Verify API errors or timeouts

✅ **Normal Flow (99% of cases):**
- Verify API creates order immediately
- Webhook receives event but order already exists (skipped)
- User gets instant feedback via verify API response

**Key Point**: Verify API is for UX (immediate), webhooks are for reliability (backup)

### Step-by-Step Flow:

```
1. Razorpay Gateway
   │
   ├─▶ Payment Event Occurs:
   │   ├─▶ payment.authorized
   │   ├─▶ payment.captured
   │   ├─▶ payment.failed
   │   └─▶ order.paid
   │
   ├─▶ POST /webhook-razorpay-payments
   │   Headers: {
   │     X-Razorpay-Signature: <signature>
   │   }
   │   Body: {
   │     event: "payment.captured",
   │     payload: {
   │       payment: { entity: {...} }
   │     }
   │   }
   │
   ▼
2. Backend (razorpayWebhookHandler)
   │
   ├─▶ Verifies Webhook Signature
   │   └─▶ Cryptographic verification using secret
   │
   ├─▶ Processes Event by Type:
   │
   │   Case: payment.authorized
   │   ├─▶ Updates PaymentOrder
   │   └─▶ Status: 'authorized'
   │
   │   Case: payment.captured
   │   ├─▶ Updates PaymentOrder
   │   │   └─▶ Status: 'captured'
   │   │   └─▶ capturedAt: timestamp
   │   ├─▶ Checks metadata.orderData exists
   │   ├─▶ Checks metadata.appOrderId (already created?)
   │   └─▶ If NOT created yet:
   │       └─▶ Calls createOrderFromPaymentOrderData()
   │           ├─▶ Creates Order
   │           ├─▶ Creates OrderItems
   │           ├─▶ Creates OrderStatusHistory
   │           └─▶ Updates PaymentOrder.metadata.appOrderId
   │
   │   Case: payment.failed
   │   ├─▶ Updates PaymentOrder
   │   └─▶ Status: 'failed'
   │
   │   Case: order.paid
   │   ├─▶ Updates PaymentOrder
   │   │   └─▶ Status: 'paid'
   │   └─▶ Creates Order (if not already created)
   │
   ▼
3. Response to Razorpay
   │
   └─▶ 200 OK (acknowledgment)
```

### Webhook Configuration:

- **URL**: `https://your-backend.com/webhook-razorpay-payments`
- **Events to Subscribe**:
  - `payment.authorized`
  - `payment.captured`
  - `payment.failed`
  - `order.paid`
- **Security**: Signature verification using `RAZORPAY_WEBHOOK_SECRET`
- **Role**: Backup mechanism - creates order if verify API fails

---

## Flow 4: Order Creation Details

### createOrderFromPaymentOrderData Function:

```
Input:
  - PaymentOrder (from database)
  - orderData (from metadata or request body)
  - accessToken (optional, for external API calls)

Steps:

1. Validate Required Fields
   ├─▶ userId (must be valid UUID)
   ├─▶ orderType (must exist)
   └─▶ Validate UUIDs: userId, templeId, addressId

2. Check Duplicate Orders
   └─▶ If PaymentOrder.metadata.appOrderId exists
       └─▶ Return existing order (skip creation)

3. Check Duplicate Event Bookings (if orderType === 'event')
   ├─▶ Calls AppControl Service API
   ├─▶ Checks for duplicate date + time slot
   └─▶ If duplicate found → return null

4. Create Order
   ├─▶ Order.id: Auto-generated (UUIDV4 default)
   ├─▶ Order.orderNumber: Auto-generated (UUIDV4 default)
   ├─▶ Order.userId: From orderData
   ├─▶ Order.templeId: Sanitized UUID or null
   ├─▶ Order.addressId: Sanitized UUID or null
   ├─▶ Order.orderType: 'product' | 'puja' | 'prasad' | 'event'
   ├─▶ Order.status: 'pending' (or from orderData)
   ├─▶ Order.paymentStatus: 'paid'
   ├─▶ Order.paymentMethod: 'razorpay'
   ├─▶ Order.paidAt: Current timestamp
   └─▶ Financial fields: subtotal, taxAmount, totalAmount, etc.

5. Create OrderItems (if orderData.orderItems exists)
   ├─▶ For each item in orderItems:
   │   ├─▶ OrderItem.id: Auto-generated (UUIDV4 default)
   │   ├─▶ OrderItem.orderId: From created Order
   │   ├─▶ OrderItem.itemType: Required field
   │   ├─▶ OrderItem.productId: Sanitized UUID or null
   │   ├─▶ OrderItem.pujaId: Sanitized UUID or null
   │   ├─▶ OrderItem.prasadId: Sanitized UUID or null
   │   ├─▶ OrderItem.dharshanId: Sanitized UUID or null
   │   └─▶ Other fields: quantity, unitPrice, totalPrice, etc.

6. Create OrderStatusHistory
   ├─▶ OrderStatusHistory.id: Auto-generated (UUIDV4 default)
   ├─▶ OrderStatusHistory.orderId: From created Order
   ├─▶ OrderStatusHistory.status: Initial status
   ├─▶ OrderStatusHistory.previousStatus: null
   └─▶ OrderStatusHistory.notes: "Order created via Razorpay webhook"

7. Create RudrakshaBooking (if orderType === 'event')
   ├─▶ Calls AppControl Service API
   ├─▶ POST /launch-event/rudraksha-booking
   └─▶ Passes booking data + orderId

8. Update PaymentOrder
   └─▶ metadata.appOrderId = <created_order_id>

Output:
  └─▶ Created Order JSON or null (if failed)
```

---

## API Endpoints Reference

### Payment Endpoints:

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/payments/orders` | JWT | Create Razorpay order |
| POST | `/payments/verify` | JWT | Verify payment & create order |
| POST | `/webhook-razorpay-payments` | None | Razorpay webhook handler (backup) |
| GET | `/payments/orders` | JWT (Admin) | List payment orders |
| GET | `/payments/orders/:orderId` | JWT | Get payment order details |
| POST | `/payments/capture` | JWT (Admin) | Manually capture payment |

### Order Endpoints:

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/orders` | JWT | Create order manually |
| GET | `/orders` | JWT | List orders (with filters) |
| GET | `/orders/:id` | JWT | Get order details |
| GET | `/orders/:orderId/invoice` | JWT | Download invoice PDF |
| GET | `/users/:userId/orders` | JWT | Get user's orders |
| PUT | `/orders/:id` | JWT | Update order |
| DELETE | `/orders/:id` | JWT | Delete order |

---

## Flutter App Integration Guide

### 1. Initialize Razorpay SDK:

```dart
import 'package:razorpay_flutter/razorpay_flutter.dart';

Razorpay _razorpay = Razorpay();

_razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
_razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _handlePaymentError);
_razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
```

### 2. Create Payment Order:

```dart
Future<String?> createPaymentOrder(double amount) async {
  final response = await http.post(
    Uri.parse('$baseUrl/payments/orders'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'userId': currentUserId,
      'amount': (amount * 100).toInt(), // Convert to paise
      'currency': 'INR',
      'receipt': 'receipt_${DateTime.now().millisecondsSinceEpoch}',
    }),
  );

  if (response.statusCode == 201) {
    final data = jsonDecode(response.body);
    return data['order']['id']; // razorpay_order_id
  }
  return null;
}
```

### 3. Open Razorpay Checkout:

```dart
void openCheckout(String razorpayOrderId, Map<String, dynamic> options) {
  var razorpayOptions = {
    'key': 'YOUR_RAZORPAY_KEY',
    'amount': options['amount'],
    'name': 'Your App Name',
    'order_id': razorpayOrderId,
    'description': 'Order Payment',
    'prefill': {
      'contact': options['phone'],
      'email': options['email'],
    },
    'external': {
      'wallets': ['paytm']
    }
  };

  _razorpay.open(razorpayOptions);
}
```

### 4. Handle Payment Success:

```dart
void _handlePaymentSuccess(PaymentSuccessResponse response) async {
  // response.orderId = razorpay_order_id
  // response.paymentId = razorpay_payment_id
  // response.signature = razorpay_signature

  await verifyPayment(
    razorpayOrderId: response.orderId!,
    razorpayPaymentId: response.paymentId!,
    razorpaySignature: response.signature!,
  );
}

Future<void> verifyPayment({
  required String razorpayOrderId,
  required String razorpayPaymentId,
  required String razorpaySignature,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/payments/verify'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'razorpay_order_id': razorpayOrderId,
      'razorpay_payment_id': razorpayPaymentId,
      'razorpay_signature': razorpaySignature,
      'userId': currentUserId,
      'orderType': selectedOrderType,
      'orderItems': cartItems.map((item) => {
        'itemType': 'product',
        'productId': item.productId,
        'quantity': item.quantity,
        'unitPrice': (item.price * 100).toInt(),
        'totalPrice': (item.totalPrice * 100).toInt(),
      }).toList(),
      'subtotal': (cartSubtotal * 100).toInt(),
      'totalAmount': (cartTotal * 100).toInt(),
      'addressId': selectedAddressId,
      'currency': 'INR',
    }),
  );

  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    
    if (data['appOrderId'] != null) {
      // Order created immediately - navigate to success
      Navigator.pushNamed(context, '/order-success', arguments: {
        'orderId': data['appOrderId'],
      });
    } else {
      // Order will be created via webhook - show pending message
      Navigator.pushNamed(context, '/payment-pending');
    }
  }
}
```

### 5. Handle Verify API Failures (Fallback Strategy):

```dart
// ⚠️ ONLY use if verify API fails (rare case)
Future<void> handleVerifyFailure(String razorpayOrderId) async {
  // Option 1: Show pending message and let webhook handle it
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Payment Successful'),
      content: Text(
        'Your payment was successful. Your order is being processed '
        'and will appear in your orders list shortly.',
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.pop(context);
            Navigator.pushReplacementNamed(context, '/orders');
          },
          child: Text('View Orders'),
        ),
      ],
    ),
  );
}

// ⚠️ Polling is NOT recommended - webhooks should handle it
// Only use in exceptional cases where user must wait
Future<String?> pollForOrder(String paymentOrderId) async {
  int attempts = 0;
  const maxAttempts = 5; // Limited attempts
  const delay = Duration(seconds: 3);

  while (attempts < maxAttempts) {
    await Future.delayed(delay);
    
    final response = await http.get(
      Uri.parse('$baseUrl/payments/orders/$paymentOrderId'),
      headers: {'Authorization': 'Bearer $token'},
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final appOrderId = data['record']['metadata']?['appOrderId'];
      
      if (appOrderId != null) {
        return appOrderId;
      }
    }
    
    attempts++;
  }
  
  return null;
}
```

---

## Key Points for Flutter Developers

### 1. **Always Verify Payment on Backend**
   - Never trust only client-side payment success
   - Always call `/payments/verify` with signature
   - This is your PRIMARY method for order creation (best UX)

### 2. **UX Strategy: Use Verify API for Immediate Feedback**
   - **Primary Flow**: Call `/payments/verify` immediately after payment
   - **Best UX**: Order created synchronously, user sees success page instantly
   - **appOrderId returned**: Navigate to order success page immediately
   - **No waiting**: User doesn't wait for webhook (which may be delayed)

### 3. **Webhooks are Backup Only**
   - **Backup Mechanism**: Webhooks create order if verify API fails
   - **Edge Cases**: Network failure, app crash, verify API error
   - **User Experience**: If verify succeeds (99% of cases), webhook is redundant
   - **Do NOT rely on webhooks for UX**: They are delayed and unreliable for user feedback

### 3. **Store PaymentOrder ID**
   - Save `paymentOrderId` after creating payment order
   - Use it to check order status if verification fails

### 4. **Error Handling**
   - Network failures during verification
   - Invalid signatures
   - Missing order data

### 5. **Order Types**
   - `'product'`: Regular product orders
   - `'puja'`: Puja service orders
   - `'prasad'`: Prasad orders
   - `'event'`: Event bookings (with rudraksha booking)

### 6. **UUID Sanitization**
   - Backend automatically sanitizes invalid UUIDs (numeric IDs → null)
   - Always use valid UUIDs for userId, addressId, productId, etc.

---

## Database Schema Summary

### PaymentOrders Table:
- `id` (UUID, PK)
- `userId` (UUID)
- `razorpayOrderId` (String, unique)
- `razorpayPaymentId` (String, nullable)
- `razorpaySignature` (String, nullable)
- `status` (Enum: created, authorized, paid, captured, failed, refunded)
- `amount` (Integer - in paise)
- `currency` (String)
- `metadata` (JSON - stores orderData and appOrderId)
- `createdAt`, `updatedAt`

### Orders Table:
- `id` (UUID, PK, auto-generated)
- `orderNumber` (UUID, unique, auto-generated)
- `userId` (UUID)
- `templeId` (UUID, nullable)
- `addressId` (UUID, nullable)
- `orderType` (Enum: darshan, puja, prasad, product, event)
- `status` (Enum: pending, confirmed, processing, ready, shipped, completed, cancelled, refunded)
- `paymentStatus` (Enum: pending, paid, failed, refunded)
- `paymentMethod` (String)
- `paymentId` (UUID, FK to PaymentOrder)
- `totalAmount`, `subtotal`, `taxAmount`, etc. (Decimal)
- `createdAt`, `updatedAt`

### OrderItems Table:
- `id` (UUID, PK, auto-generated)
- `orderId` (UUID, FK to Orders)
- `itemType` (String)
- `productId`, `pujaId`, `prasadId`, `dharshanId` (UUID, nullable)
- `quantity`, `unitPrice`, `totalPrice`
- `createdAt`, `updatedAt`

### OrderStatusHistories Table:
- `id` (UUID, PK, auto-generated)
- `orderId` (UUID, FK to Orders)
- `status` (String)
- `previousStatus` (String, nullable)
- `notes` (Text)
- `createdAt`, `updatedAt`

---

## Common Scenarios

### Scenario 1: ✅ Best Case - Immediate Order Creation (99% of cases)
1. User initiates payment → PaymentOrder created
2. User completes payment in Razorpay
3. **Flutter calls `/payments/verify` IMMEDIATELY**
4. **Backend creates Order synchronously**
5. **Response contains `appOrderId`**
6. **User sees order success page instantly** ⚡
7. Webhook received later (redundant but safe)

**UX Result**: ⚡ Instant feedback, happy user, best experience

### Scenario 2: ⚠️ Edge Case - Verify API Fails
1. User completes payment in Razorpay
2. Flutter calls `/payments/verify` but network fails
3. Flutter shows "Payment successful, order processing..." message
4. **Razorpay sends webhook** → Backend creates Order
5. User checks orders list later → Order appears

**UX Result**: Slightly delayed but user informed, webhook ensures order creation

### Scenario 3: ⚠️ Edge Case - App Crashes
1. User completes payment in Razorpay
2. Flutter app crashes before calling `/payments/verify`
3. **Razorpay sends webhook** → Backend creates Order
4. User reopens app → Checks orders list → Order exists

**UX Result**: Order created via webhook, user can still see it

### Scenario 4: ❌ Payment Failed
1. Payment fails in Razorpay
2. Webhook received with `payment.failed` event
3. PaymentOrder status updated to 'failed'
4. Flutter app shows error message
5. No order created

**UX Result**: User sees error, can retry payment

### Scenario 5: ⚠️ Duplicate Event Booking
1. User tries to book same date/time slot twice
2. Backend checks for duplicates via AppControl Service
3. Returns null (order not created)
4. Flutter app shows "Already booked" message

**UX Result**: User informed about duplicate, no order created

---

## UX Best Practices Summary

### ✅ DO:
1. **Call `/payments/verify` IMMEDIATELY after payment success**
2. **Show loading indicator during verify API call**
3. **Navigate to success page if `appOrderId` is returned**
4. **Handle verify API errors gracefully**
5. **Let webhooks handle edge cases silently**

### ❌ DON'T:
1. **Don't wait for webhooks for UX** (they're delayed)
2. **Don't poll repeatedly** (wasteful, webhooks handle it)
3. **Don't rely on client-side payment success only** (always verify)
4. **Don't show "waiting for webhook" message** (bad UX)
5. **Don't make user wait unnecessarily** (verify API is fast)

### 🎯 Recommended UX Flow:

```
Payment Success
    ↓
Show Loading: "Processing order..."
    ↓
Call /payments/verify (IMMEDIATE)
    ↓
    ├─▶ Success + appOrderId?
    │       ↓
    │   ✅ Navigate to Order Success Page
    │   ✅ Show "Order placed successfully!"
    │   ✅ User happy - immediate feedback
    │
    └─▶ Error/Failure?
            ↓
        ⚠️ Show "Payment successful, processing..."
        ⚠️ Navigate to Orders List
        ⚠️ Webhook will create order (user can check later)
```

---

## Environment Variables Required

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# External Services
APPCONTROL_SERVICE_URL=https://appcontrol-service.com

# Database (configured separately)
SQL_TYPE=postgres
SQL_HOST=localhost
SQL_PORT=5432
SQL_DATABASE=payment_db
```

---

## Security Notes

1. **Signature Verification**: Always verify Razorpay signatures (cryptographic)
2. **JWT Authentication**: All endpoints (except webhook) require JWT
3. **UUID Validation**: Backend sanitizes all UUID inputs
4. **Webhook Security**: Webhook endpoint has no auth but verifies signature
5. **Idempotency**: Duplicate webhook events handled gracefully

---

## Troubleshooting

### Issue: Order not created after payment
- **Check**: PaymentOrder.metadata.appOrderId
- **Solution**: Order will be created via webhook (check logs)

### Issue: Invalid UUID error
- **Check**: Ensure all IDs are valid UUIDs or null
- **Solution**: Backend auto-sanitizes, but frontend should send valid UUIDs

### Issue: Webhook not receiving events
- **Check**: Razorpay dashboard webhook configuration
- **Check**: Webhook URL is publicly accessible
- **Check**: Signature verification is passing

### Issue: Duplicate orders
- **Check**: PaymentOrder.metadata.appOrderId check prevents duplicates
- **Check**: Webhook idempotency handling

---

This document provides a complete understanding of the order and payment system flow.
