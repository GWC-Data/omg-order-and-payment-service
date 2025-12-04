## OMG Payment Microservice – Developer Guide

This document explains how the payment microservice is structured and how its Razorpay flows work at a code level. It complements the main `README.md` (which is more high-level and ops-facing).

---

## 1. High-Level Architecture

- **Runtime**: Node.js (Express) wrapped by `node-server-engine`.
- **HTTP API**: REST endpoints under `/payments/**`.
- **Database**: Sequelize ORM with models:
  - `PaymentOrder`
- **User mapping**: Every `PaymentOrder` row stores a `userId` so requests and reconciliations can be tied back to the owning user.
- **Payments Provider**: Razorpay (orders, captures, HMAC verification, webhooks).
- **Webhook Support**: Real-time payment status updates via Razorpay webhooks with HMAC signature verification.
- **Error Handling**: Comprehensive error handling with specific error codes, environment-aware error responses, duplicate payment prevention, and detailed logging for debugging.
- **Security**: HMAC signature verification for both manual payment verification and webhook events.
- **Docs**: OpenAPI YAML:
  - `src/docs/index.yaml` – root doc, shared schemas.
  - `src/endpoints/payments/payments.docs.yaml` – paths for all payment-related endpoints.

Key runtime entrypoints:

- `src/index.ts`
  - Bootstraps the server and DB:
    - Creates the HTTP server via `createServer()`.
    - Initializes Sequelize (`sequelize.init()`).
    - Registers models (`sequelize.addModels(models)`).
    - Optionally runs pending migrations when `RUN_DB_MIGRATION=true`.
- `src/app/createServer.ts`
  - Configures the `node-server-engine` `Server` instance:
    - Adds `express.json()` middleware.
    - Adds `middleware.swaggerDocs()` to serve Swagger/OpenAPI UI.
    - Registers all endpoints from `src/endpoints`.

---

## 2. Endpoint Overview

All endpoints live in `src/endpoints/payments` and are exported via `src/endpoints/index.ts`.

The main configuration is in `payments.ts` (each endpoint is a `new Endpoint({...})` from `node-server-engine`):

- **`POST /payments/orders`** – `createPaymentOrderEndpoint`
  - **Auth**: `JWT`
  - **Permissions**: `create:payments` or `AllPermissions`
  - **Validator**: `createPaymentOrderValidator`
  - **Handler**: `createPaymentOrderHandler`
  - **Notes**: Requires a `userId` in the request body so the order can be tied to a specific user.

- **`GET /payments/orders`** – `listPaymentOrdersEndpoint`
  - **Auth**: `JWT`
  - **Permissions**: `read:payments` or `AllPermissions`
  - **Validator**: `listPaymentOrdersValidator`
  - **Handler**: `listPaymentOrdersHandler`
  - **Notes**: Supports filtering by `status` and/or `userId`.

- **`GET /payments/orders/:orderId`** – `getPaymentOrderEndpoint`
  - **Auth**: `JWT`
  - **Permissions**: `read:payments` or `AllPermissions`
  - **Validator**: `getPaymentOrderValidator`
  - **Handler**: `getPaymentOrderHandler`

- **`POST /payments/verify`** – `verifyPaymentSignatureEndpoint`
  - **Auth**: `JWT`
  - **Permissions**: `update:payments` or `AllPermissions`
  - **Validator**: `verifyPaymentValidator`
  - **Handler**: `verifyPaymentSignatureHandler`

- **`POST /payments/capture`** – `capturePaymentEndpoint`
  - **Auth**: `JWT`
  - **Permissions**: `update:payments` or `AllPermissions`
  - **Validator**: `capturePaymentValidator`
  - **Handler**: `capturePaymentHandler`

- **`POST /payments/webhook/razorpay`** – `razorpayWebhookEndpoint`
  - **Auth**: `NONE` (webhook from external provider)
  - **Permissions**: N/A
  - **Validator**: `razorpayWebhookValidator`
  - **Handler**: `razorpayWebhookHandler`
  - **Notes**: Receives webhook events from Razorpay. Requires `X-Razorpay-Signature` header for HMAC verification.


Swagger/OpenAPI path definitions for these endpoints are kept in `src/endpoints/payments/payments.docs.yaml`. These docs are merged with the base OpenAPI doc from `src/docs/index.yaml` and served via `middleware.swaggerDocs()`.

---

## 3. Request/Response Models (Types + Validators)

Types for request bodies and query parameters are in `src/endpoints/payments/payments.types.ts`:

- **`CreatePaymentOrderBody`**
  - `userId: string` (required; owning user/customer identifier)
  - `amount: number` (major units, e.g., rupees)
  - `currency?: string` (default: `INR`, upper-cased)
  - `receipt?: string`
  - `notes?: Record<string, string>`
  - `metadata?: Record<string, unknown>`
  - `customerEmail?: string`
  - `customerPhone?: string`
  - `autoCapture?: boolean`

- **`VerifyPaymentBody`**
  - `razorpay_order_id: string`
  - `razorpay_payment_id: string`
  - `razorpay_signature: string`

- **`CapturePaymentBody`**
  - `paymentId: string`
  - `amount?: number` (major units)
  - `currency?: string`

- **`ListPaymentsQuery`**
  - `userId?: string` (optional filter to scope results to a user)
  - `status?: PaymentStatus` (`'created' | 'authorized' | 'paid' | 'captured' | 'failed' | 'refunded'`)
  - `page?: number`
  - `pageSize?: number`

- **`RazorpayWebhookPayload`**
  - `event: string` (webhook event type)
  - `account_id: string`
  - `contains: string[]`
  - `payload: { payment?: { entity: RazorpayPaymentEntity }, order?: { entity: RazorpayOrderEntity }, refund?: { entity: RazorpayRefundEntity } }`
  - `created_at: number`

- **`RazorpayPaymentEntity`**
  - Payment details from Razorpay including `id`, `amount`, `currency`, `status`, `order_id`, `method`, etc.

- **`RazorpayOrderEntity`**
  - Order details from Razorpay including `id`, `amount`, `status`, `receipt`, etc.

- **`WebhookVerificationBody`**
  - `payload: RazorpayWebhookPayload`
  - `signature: string` (HMAC signature for verification)

Validation is implemented using `express-validator` schemas in `payments.validator.ts`:

- **`createPaymentOrderValidator`**
  - Ensures:
    - `userId` exists and is a non-empty string (or trimmed value).
    - `amount` exists, is a float `> 0`, and coerced to number.
    - `currency` is optional but must be a 3-letter ISO code.
    - `notes`, `metadata` are either `undefined` or valid JSON objects.
    - `customerEmail` is a valid email if present.
    - `autoCapture` is optional boolean.

- **`verifyPaymentValidator`**
  - Ensures all Razorpay fields (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) exist and are strings.

- **`capturePaymentValidator`**
  - Requires `paymentId`.
  - Optional `amount` must be `> 0` if present.
  - Optional `currency` must be a 3-letter string.

- **`getPaymentOrderValidator`**
  - Requires `orderId` param.

- **`listPaymentOrdersValidator`**
  - Validates `status` against allowed payment statuses.
  - Allows optional `userId` filters.
  - Ensures `page >= 1`, `1 <= pageSize <= 100` when provided.

- **`razorpayWebhookValidator`**
  - Requires `X-Razorpay-Signature` header for webhook HMAC verification.

These validators run before handlers; invalid input results in standard 400 responses with error details (handled by `node-server-engine`’s middleware chain).

---

## 4. Handler Logic and Payment Flows

Handlers are implemented in `payments.handler.ts` and use:

  - `PaymentOrder` Sequelize model.
- Razorpay client helpers from `src/utils` (via `getRazorpayClient`, `verifyPaymentSignature`).
- Auth/typing from `node-server-engine` (`EndpointHandler`, `EndpointRequestType`, `EndpointAuthType`).

### 4.1 Create Payment Order – `POST /payments/orders`

- File: `payments.handler.ts` – `createPaymentOrderHandler`.
- Flow:
  1. Casts `req.body` to `CreatePaymentOrderBody`.
  2. Verifies `userId` is present (falls back to `res.status(400)` + `USER_ID_REQUIRED` if missing).
  3. Converts `amount` from major units to minor units (paise) using `toMinorUnits`.
  4. Normalizes currency (`(body.currency ?? 'INR').toUpperCase()`).
  5. Creates a Razorpay order via `client.orders.create(...)`.
  6. Persists a `PaymentOrder` record with:
     - `userId`, `razorpayOrderId`, `amount`, `currency`, `status: 'created'`, `receipt`, `notes`, `metadata`, customer contact, `expiresAt`.
  7. Responds with HTTP `201` and `{ message, order, record }`.
- Error handling:
  - On any failure, logs the error and returns HTTP `502` with `PAYMENT_ORDER_CREATION_FAILED`.

### 4.2 List Payment Orders – `GET /payments/orders`

- File: `payments.handler.ts` – `listPaymentOrdersHandler`.
- Flow:
  1. Reads `status`, `userId`, `page`, `pageSize` from `req.query` (typed as `ListPaymentsQuery`).
  2. Normalizes `status` to lowercase `PaymentStatus` if present and trims `userId`.
  3. Computes pagination offset: `(page - 1) * pageSize`.
  4. Runs `PaymentOrder.findAndCountAll(...)` with optional `where` on `status` **and/or** `userId`, limit, offset, and sorting by `createdAt DESC`.
  5. Responds with HTTP `200` and `{ data, page, pageSize, total }`.
- Error handling:
  - Logs the error and returns HTTP `500` with `"Unable to list payment orders"`.

### 4.3 Get Payment Order Details – `GET /payments/orders/:orderId`

- File: `payments.handler.ts` – `getPaymentOrderHandler`.
- Flow:
  1. Reads `orderId` from `req.params`.
  2. Finds the local record via `PaymentOrder.findOne({ where: { razorpayOrderId: orderId } })`.
  3. If not found, responds with HTTP `404` and `PAYMENT_ORDER_NOT_FOUND`.
  4. Otherwise:
     - Fetches live Razorpay order: `client.orders.fetch(orderId)`.
     - Fetches payments associated with that order: `client.payments.all({ order_id: orderId })`.
  5. Responds with HTTP `200` and `{ record, remoteOrder, payments }`.
- Error handling:
  - Logs the error and returns HTTP `502` with `PAYMENT_DETAILS_FETCH_FAILED`.

### 4.4 Verify Payment Signature – `POST /payments/verify`

- File: `payments.handler.ts` – `verifyPaymentSignatureHandler`.
- Flow:
  1. Casts `req.body` to `VerifyPaymentBody`.
  2. Calls `verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)`.
  3. If invalid, responds with HTTP `400` and `PAYMENT_SIGNATURE_INVALID`.
  4. Finds the corresponding `PaymentOrder` by `razorpayOrderId`.
     - If not found, responds with HTTP `404` and `PAYMENT_ORDER_NOT_FOUND`.
  5. If the order already has a `razorpayPaymentId` and it **differs** from the incoming `razorpay_payment_id`, responds with HTTP `409` and `PAYMENT_ORDER_ALREADY_PROCESSED`.
  6. Otherwise, updates the order:
     - `razorpayPaymentId`
     - `razorpaySignature`
     - `status` to `'paid'` unless it is already `'captured'`.
  7. Responds with HTTP `200` and `{ message: 'Payment verified successfully', order }`.
- Error handling:
  - Logs the error and returns HTTP `500` with `"Unable to verify payment signature"`.

### 4.5 Capture Payment – `POST /payments/capture`

- File: `payments.handler.ts` – `capturePaymentHandler`.
- Flow:
  1. Casts `req.body` to `CapturePaymentBody`.
  2. Looks up `PaymentOrder` by `razorpayPaymentId` (if such a record exists).
  3. Determines `captureAmount`:
     - If `body.amount` is provided, converts to minor units via `toMinorUnits`.
     - Else, falls back to `order?.amount`.
  4. If `captureAmount` is `undefined` (no amount and no known order), returns HTTP `400` with `"Amount is required when the payment is unknown"`.
  5. Calls `client.payments.capture(paymentId, captureAmount, currency)`, where:
     - `currency` is `(body.currency ?? order?.currency ?? 'INR').toUpperCase()`.
  6. If there is an existing `order`, updates it:
     - `status: 'captured'`
     - `capturedAt` from `captureResponse.captured_at` (unix ts)
     - `amount` from `captureResponse.amount`
     - `failureReason: undefined`
  7. Responds with HTTP `200` and `{ message: 'Payment captured successfully', capture: captureResponse, order }`.
- Error handling:
  - Logs the error and returns HTTP `502` with `PAYMENT_CAPTURE_FAILED`.

### 4.6 Handle Razorpay Webhooks – `POST /payments/webhook/razorpay`

- File: `payments.handler.ts` – `razorpayWebhookHandler`.
- Flow:
  1. Extracts `X-Razorpay-Signature` header and raw request body.
  2. Verifies webhook signature using `verifyWebhookSignature(rawBody, signature)`.
  3. If signature invalid, responds with HTTP `400` and `WEBHOOK_SIGNATURE_INVALID`.
  4. Parses and validates the webhook payload structure.
  5. Routes the event to appropriate handler based on `event` type:
     - `payment.authorized` → `handlePaymentAuthorized()`
     - `payment.captured` → `handlePaymentCaptured()`
     - `payment.failed` → `handlePaymentFailed()`
     - `order.paid` → `handleOrderPaid()`
     - Refund events logged for future implementation
  6. Each handler updates the corresponding `PaymentOrder` record with new status and metadata.
  7. Responds with HTTP `200` for all processed events.
- Error handling:
  - Invalid signature: HTTP `400` with `WEBHOOK_SIGNATURE_INVALID`
  - Invalid payload: HTTP `400` with `WEBHOOK_PAYLOAD_INVALID`
  - Processing errors: HTTP `500` with `WEBHOOK_PROCESSING_FAILED`
  - Unsupported events: HTTP `200` with `WEBHOOK_EVENT_UNSUPPORTED`

**Supported Webhook Events:**
- `payment.authorized` - Updates order status to 'authorized' and stores payment ID
- `payment.captured` - Updates order status to 'captured' with capture timestamp
- `payment.failed` - Updates order status to 'failed' with error details
- `order.paid` - Updates order status to 'paid' for order-level events
- Refund events are logged but not processed (ready for future implementation)

**Security Notes:**
- Webhook signature verification prevents unauthorized payment updates
- All webhook events are logged for audit trails
- Duplicate events are handled gracefully (idempotent operations)
- Webhook URL must be configured in Razorpay Dashboard as `https://your-domain.com/payments/webhook/razorpay`

---

## 5. Razorpay Utilities and Signatures

The Razorpay helper functions are exposed from `src/utils`:

- `getRazorpayClient()` – creates and returns a configured Razorpay SDK instance.
- `verifyPaymentSignature(orderId, paymentId, signature)` – performs HMAC verification for the payment verification endpoint.
- `verifyWebhookSignature(rawBody, signature)` – performs HMAC-SHA256 verification for incoming webhook payloads using Razorpay's secret key.

Key points:

- Amounts passed to Razorpay must be in **minor units** (e.g., paise). Handlers call `toMinorUnits` to convert.
- Secrets come from environment variables (see `README.md`) or an optional JSON file (`keys/razorpay.json`).

---

## 6. Database Layer

Models and migrations are under `src/db`:

- `src/db/models/PaymentOrder.ts`
  - Represents a single Razorpay order and its local metadata:
    - IDs (`id`, `razorpayOrderId`, optional `razorpayPaymentId`)
    - Owner metadata (`userId` ties the record to the requesting user)
    - Amount, currency, status (`PaymentStatus` enum)
    - Customer info (`customerEmail`, `customerPhone`)
    - Timestamps (`createdAt`, `updatedAt`, `capturedAt`, `expiresAt`)
    - `failureReason`, `notes`, `metadata`

- Custom Migrations (no sequelize_meta table):
  - `src/db/migrations/202512030001-create-payment-orders.ts` - Creates the PaymentOrders table with all columns
  - `src/db/migrations/202512030003-add-user-id-to-payment-orders.ts` - Adds userId column and index
  - `src/utils/migrations.ts` - Custom migration runner that doesn't create sequelize_meta table
  - These are executed by `runCustomMigrations()` when `RUN_DB_MIGRATION=true`.

---

## 7. Webhook Configuration and Best Practices

### 7.1 Setting Up Webhooks in Razorpay Dashboard

1. **Login** to your Razorpay Dashboard
2. **Navigate** to Settings → Webhooks
3. **Create** a new webhook with:
   - **URL**: `https://your-domain.com/payments/webhook/razorpay`
   - **Active Events**: Select payment and order events you want to track
   - **Secret**: Note the webhook secret (used for HMAC verification)

### 7.2 Recommended Webhook Events

Enable these events for comprehensive payment tracking:
- `payment.authorized` - Payment successfully authorized
- `payment.captured` - Payment captured (funds transferred)
- `payment.failed` - Payment failed
- `order.paid` - Order marked as paid
- `refund.created` - Refund initiated
- `refund.processed` - Refund completed

### 7.3 Webhook Security

- **HMAC Verification**: All webhooks are verified using HMAC-SHA256 with Razorpay's secret key
- **Idempotency**: Handlers are designed to handle duplicate events gracefully
- **Logging**: All webhook events are logged for audit and debugging purposes
- **Error Handling**: Failed webhook processing doesn't break the payment flow

### 7.4 Testing Webhooks

Use Razorpay's webhook testing tools or services like ngrok for local development:
```bash
# Using ngrok to expose local server
ngrok http 3000
# Use the ngrok URL in Razorpay dashboard for testing
```

---

## 9. How to Add a New Endpoint

To add another payment-related endpoint (for example, refunds), follow this pattern:

1. **Define Types**
   - Add request/response interfaces to `payments.types.ts`.
2. **Add Validator**
   - Create a new `Schema` in `payments.validator.ts` with `express-validator`.
3. **Implement Handler**
   - Add a new handler function in `payments.handler.ts`.
   - Use existing helpers (`getRazorpayClient`, models, etc.) as needed.
4. **Register Endpoint**
   - In `payments.ts`, instantiate a new `Endpoint` with:
     - `path`, `method`, `authType`, `validator`, `middleware`, and `handler`.
5. **Update OpenAPI Docs**
   - Add the route under the appropriate path in `payments.docs.yaml`.
6. **Tests**
   - Add tests under `test/` (reusing the existing mocha/nyc tooling) if available.

This keeps runtime behavior, OpenAPI docs, and validation strictly in sync.

---

## 10. Local Development Notes

- **Starting the service**
  - `npm install`
  - `npm run build`
  - `npm start`
- **Swagger UI**
  - Served by `middleware.swaggerDocs()`; by default, the OpenAPI document aggregates:
    - `src/docs/index.yaml`
    - `src/endpoints/payments/payments.docs.yaml`
- **Database**
  - Ensure the SQL env vars are set.
  - Set `RUN_DB_MIGRATION=true` on first run to run custom migrations (no sequelize_meta table).
- **Webhook Testing**
  - For local development, use ngrok or similar tools to expose your local server
  - Configure the webhook URL in Razorpay Dashboard to point to your exposed URL
  - Use Razorpay's test credentials for webhook testing
  - Webhook events will appear in server logs for debugging

Use this guide when you need to:

- Understand how requests move from HTTP into Razorpay and the DB.
- Configure and handle Razorpay webhooks for real-time payment updates.
- Implement secure webhook signature verification.
- Safely extend the API surface.
- Debug end-to-end flows across the service, webhooks, and Razorpay.


