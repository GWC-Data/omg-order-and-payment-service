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

## Next Steps

- Wire the service to your central auth provider by configuring the JWT middleware in `node-server-engine`.
- Extend `src/services` with domain-specific orchestration (e.g., subscription billing, retries).
- Plug the models into reporting/analytics pipelines if you need revenue dashboards.
