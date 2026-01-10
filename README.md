# OMG Payment Microservice

> Razorpay-first payment orchestration service that follows the server-engine template used by the identify stack.

## Features

- REST endpoints for creating, listing, fetching, verifying, and capturing Razorpay orders.
- Every payment order persists a platform `userId` for traceability and per-user histories.
- Sequelize model + migrations for `PaymentOrders` only (webhook events removed).
- Swagger docs (`/payments/**/*.docs.yaml`) automatically mounted through `node-server-engine`.
- Re-usable Razorpay utility that loads secrets from env vars or `keys/razorpay.json`.

## Project Layout

```
omg-payment-microservice/
├── docs/                 # Packaged OpenAPI bundle (for publishing)
├── env/                  # dotenv loader
├── keys/razorpay.json    # Local Razorpay creds (never commit real secrets)
├── src/
│   ├── app/              # server bootstrap
│   ├── db/
│   │   ├── migrations/   # sequelize migrations
│   │   └── models/       # PaymentOrder model only
│   ├── docs/             # Root OpenAPI document + schemas
│   ├── endpoints/
│   │   └── payments/     # handlers, validators, swagger docs
│   ├── services/         # (reserved for future domain logic)
│   └── utils/razorpay.ts # client + signature helpers
└── test/                 # mocha bootstrap (re-uses server-engine harness)
```

## Getting Started

```bash
npm install
npm run build
npm start
```

The service boots through `node-server-engine`, registers Swagger docs automatically, and exposes the Razorpay endpoints under `/payments`.

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (defaults to 5050 via server-engine). |
| `RAZORPAY_KEY_ID` | Razorpay dashboard key id. |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard key secret. |
| `RAZORPAY_KEYS_FILE` | Optional path to a JSON file that follows `keys/razorpay.json`. |
| `RUN_DB_MIGRATION` | `"true"` to run custom migrations automatically (no sequelize_meta table). |
| `SQL_*` | Standard server-engine database configuration (host, port, user, password, db, type). |

If env vars are not provided, the helper falls back to `keys/razorpay.json`. Never commit real credentials—keep the sample file for local development only.

## Available Scripts

- `npm run start` – starts the compiled service (`dist/index.js`).
- `npm run build` – compiles Typescript, runs tsc-alias, and emits Babel output.
- `npm test` – mocha + nyc test harness (stubs Razorpay by default).
- `npm run lint` / `npm run lint:fix` – ESLint on `src`.

## API & Swagger

`middleware.swaggerDocs()` serves the aggregated OpenAPI definition. The generated docs live in:

- `src/docs/index.yaml` – base definition (security schemes, shared schemas).
- `src/endpoints/payments/payments.docs.yaml` – path definitions for each route.

Key endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/payments/orders` | Create a Razorpay order + persist metadata (requires `userId`). |
| `GET` | `/payments/orders` | Paginated list of orders with filtering by status and `userId`. |
| `GET` | `/payments/orders/{orderId}` | Fetch local + live Razorpay details. |
| `POST` | `/payments/verify` | Server-side signature verification. |
| `POST` | `/payments/capture` | Capture a payment (manual capture flows). |

Refer to the YAML docs for request/response contracts and schema references.

## Razorpay Integration Notes

- Amounts are accepted in **major** currency units (e.g., rupees). The handler converts them to minor units (paise) before calling Razorpay.
- `PaymentOrders` keep an auditable trail that can be replayed or reconciled with Razorpay using `GET /payments/orders/{orderId}`.

## Documentation

Comprehensive documentation is available for developers:

- **[Quick Start Guide](./QUICK_START.md)** - Get started in 5 minutes
- **[Payment Flow Guide](./PAYMENT_FLOW_GUIDE.md)** - Complete payment flow documentation with diagrams
- **[API Reference](./API_REFERENCE.md)** - Complete API endpoint documentation
- **[Developer Guide](./DEVELOPER_GUIDE.md)** - Architecture and implementation details
- **[Improvements Summary](./IMPROVEMENTS_SUMMARY.md)** - Analysis and recommended improvements

## Payment Flow Overview

The service handles the complete payment lifecycle:

1. **Create Payment Order** → `POST /payments/orders` - Create Razorpay order
2. **Razorpay Checkout** → Frontend initializes Razorpay checkout
3. **Verify Payment** → `POST /payments/verify` - Verify signature and create order
4. **Webhook Updates** → `POST /payments/webhook/razorpay` - Real-time status updates

See [PAYMENT_FLOW_GUIDE.md](./PAYMENT_FLOW_GUIDE.md) for detailed flow documentation.

## Key Features

- ✅ **Razorpay Integration** - Complete payment gateway integration
- ✅ **Order Management** - Create orders after successful payment
- ✅ **Webhook Support** - Real-time payment status updates
- ✅ **Security** - HMAC signature verification
- ✅ **Error Handling** - Comprehensive error handling
- ✅ **API Documentation** - Complete API reference
- ✅ **Status Tracking** - Order status history tracking

## API Endpoints

### Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/payments/orders` | Create Razorpay payment order |
| `GET` | `/payments/orders` | List payment orders (with filters) |
| `GET` | `/payments/orders/:orderId` | Get payment order details |
| `POST` | `/payments/verify` | Verify payment signature and create order |
| `POST` | `/payments/capture` | Manually capture authorized payment |
| `POST` | `/payments/webhook/razorpay` | Razorpay webhook endpoint |

### Order Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create order directly |
| `GET` | `/orders` | List orders (with filters) |
| `GET` | `/orders/:id` | Get order by ID |
| `GET` | `/orders/:orderId/details` | Get order details with items |
| `GET` | `/orders/user/:userId` | Get orders by user ID |
| `PUT` | `/orders/:id` | Update order |
| `DELETE` | `/orders/:id` | Delete order |

See [API_REFERENCE.md](./API_REFERENCE.md) for complete API documentation.

## Next Steps

1. **Read the Documentation**:
   - Start with [QUICK_START.md](./QUICK_START.md) for setup
   - Review [PAYMENT_FLOW_GUIDE.md](./PAYMENT_FLOW_GUIDE.md) for payment flow
   - Check [API_REFERENCE.md](./API_REFERENCE.md) for API details

2. **Configure Your Environment**:
   - Set up Razorpay credentials (test or production)
   - Configure database connection
   - Set up webhook URL in Razorpay Dashboard

3. **Test the Integration**:
   - Use Razorpay test mode for development
   - Test payment flow end-to-end
   - Verify webhook delivery

4. **Review Improvements**:
   - Check [IMPROVEMENTS_SUMMARY.md](./IMPROVEMENTS_SUMMARY.md) for recommended improvements
   - Implement rate limiting for production
   - Add monitoring and logging

5. **Production Deployment**:
   - Wire the service to your central auth provider
   - Extend `src/services` with domain-specific orchestration
   - Plug models into reporting/analytics pipelines
