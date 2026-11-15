# NexaMarket

NexaMarket is a fictional enterprise multi-vendor e-commerce marketplace — inspired by Amazon and eBay —
built to demonstrate real-world Software Development, DevOps, CI/CD, Cloud Engineering and Site Reliability
Engineering practices for a JumpToTech training engagement.

Shoppers can browse categories, search and filter products, manage a cart, and check out with a **simulated**
payment. Sellers manage their own product catalog and inventory from a seller dashboard. Administrators get a
revenue and operations dashboard. All customer, seller and payment data is fictional — **no real payments are
processed**.

> This repository covers application development only. GitHub Actions, SonarQube, Trivy, Terraform, Amazon EKS,
> Helm, Argo CD, Prometheus/Grafana, PagerDuty and disaster recovery are owned by the DevOps team and are **not**
> included here — see [Handover to DevOps](#handover-to-devops) below.

---

## 1. Architecture

```
                         ┌─────────────────────┐
                         │        Browser        │
                         └──────────┬───────────┘
                                    │ HTTPS (DevOps-owned ALB/Ingress in prod)
                         ┌──────────▼───────────┐
                         │   frontend (Nginx)    │  serves the React SPA
                         │   unprivileged:8080    │  proxies /api/* -> backend
                         └──────────┬───────────┘
                                    │ /api/*
                         ┌──────────▼───────────┐
                         │  backend (Express)    │  REST API, JWT auth, RBAC
                         │  Node.js 20, :4000     │  /health /ready /metrics
                         └──────────┬───────────┘
                                    │ pg (parameterized SQL, pooled, transactions)
                         ┌──────────▼───────────┐
                         │     PostgreSQL 16      │  source of truth
                         └───────────────────────┘
```

- **Frontend**: React 19 + TypeScript + Vite, built as a static SPA and served by Nginx. Nginx also reverse-proxies
  `/api/*` to the backend so the browser only ever talks to one origin.
- **Backend**: Node.js + Express + TypeScript REST API. Stateless — horizontally scalable behind a load balancer.
  Structured JSON logs, request correlation IDs, and Prometheus metrics are built in for the DevOps observability
  stack to scrape/ingest.
- **Database**: PostgreSQL is the single source of truth. Schema is managed with hand-written, numbered SQL
  migrations and an idempotent seed script, both runnable standalone (outside the app container) so the DevOps
  team can apply them against a Kubernetes-managed PostgreSQL StatefulSet independently of app deploys.

### Why this stack

- No ORM — plain `pg` with parameterized queries and explicit transactions, so the SQL running in production is
  exactly the SQL in this repo (easy to review, easy to port to any Postgres-compatible managed service).
- No CSS framework — a small hand-written design system (`frontend/src/styles/global.css`) keeps the dependency
  surface minimal while still being fully responsive.
- No ORM-driven migration tool — numbered `.sql` files plus a tiny Node migration runner, so migrations are
  portable to whatever the DevOps team runs them with (`psql`, a Kubernetes Job, Flyway, etc.) without a
  framework lock-in.

---

## 2. Repository structure

```
nexamarket-ecommerce/
├── backend/                  Node.js + Express + TypeScript REST API
│   ├── src/
│   │   ├── config/           env validation (zod), PostgreSQL pool
│   │   ├── middleware/       auth/RBAC, error handling, request IDs, Prometheus metrics, validation
│   │   ├── routes/           Express routers per resource
│   │   ├── services/         business logic + parameterized SQL
│   │   ├── validation/       zod request schemas
│   │   ├── db/
│   │   │   ├── migrations/   001_extensions.sql … 011_payments.sql
│   │   │   ├── seed/         idempotent seed data (42 products, categories, users, demo order)
│   │   │   └── migrate.ts    standalone migration runner (tracks schema_migrations)
│   │   ├── app.ts / index.ts Express app wiring + graceful shutdown
│   ├── tests/
│   │   ├── unit/             vitest unit tests (mocked pg Pool, no DB required)
│   │   └── integration/      supertest tests against a real PostgreSQL instance
│   ├── Dockerfile            multi-stage, non-root runtime
│   └── package.json
├── frontend/                 React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── api/               typed REST client
│   │   ├── context/           Auth + Cart React context providers
│   │   ├── components/        Header, ProductCard, Pagination, route guards, etc.
│   │   ├── pages/              Home, Products, ProductDetail, Cart, Checkout, Orders, OrderDetail,
│   │   │                      Login, Register, SellerDashboard, AdminDashboard
│   │   └── styles/global.css  design system
│   ├── nginx/default.conf.template  Nginx reverse-proxy config (templated via envsubst)
│   ├── Dockerfile             multi-stage, unprivileged Nginx runtime
│   └── package.json
├── docker-compose.yml         local orchestration: postgres, migrate, seed, backend, frontend
├── .env.example               root-level compose variables (no real secrets)
└── README.md
```

---

## 3. Local installation (without Docker)

Prerequisites: Node.js 20+, npm 10+, a local PostgreSQL 16 instance.

```bash
# 1. Create a database
createdb nexamarket

# 2. Backend
cd backend
cp .env.example .env            # edit DATABASE_URL / JWT_SECRET
npm ci
npm run migrate                 # applies db/migrations/*.sql, idempotent
npm run seed                    # idempotent: categories, sellers, customers, 42 products, 1 demo order
npm run dev                     # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env
npm ci
npm run dev                     # http://localhost:5173 (Vite proxies /api -> localhost:4000)
```

Demo accounts created by the seed script (all share the password `Passw0rd!2026`):

| Role     | Email                              |
|----------|-------------------------------------|
| admin    | `admin@nexamarket.test`             |
| seller   | `seller.northwind@nexamarket.test`  |
| seller   | `seller.cascade@nexamarket.test`    |
| seller   | `seller.aurora@nexamarket.test`     |
| customer | `alex.johnson@nexamarket.test`      |

---

## 4. Environment variables

See `.env.example` (root, for docker-compose), `backend/.env.example` and `frontend/.env.example`.

### Backend

| Variable          | Description                                              | Example                                  |
|-------------------|------------------------------------------------------------|-------------------------------------------|
| `NODE_ENV`        | `development` \| `test` \| `production`                    | `production`                              |
| `PORT`            | HTTP port the API listens on                                | `4000`                                    |
| `DATABASE_URL`    | PostgreSQL connection string                                | `postgres://user:pass@host:5432/nexamarket` |
| `PGPOOL_MAX`      | Max connections in the `pg` pool                            | `10`                                      |
| `JWT_SECRET`      | HMAC secret for signing JWTs — **required, 16+ chars**     | generate with `openssl rand -base64 48`   |
| `JWT_EXPIRES_IN`  | Token lifetime                                              | `2h`                                      |
| `CORS_ORIGIN`     | Allowed origin(s) for CORS, comma-separated, or `*`         | `http://localhost:8080`                   |
| `LOG_LEVEL`       | pino log level                                              | `info`                                    |

### Frontend

| Variable                     | Description                                                     |
|-------------------------------|-------------------------------------------------------------------|
| `VITE_API_URL`                | Base path the browser calls for the API (baked in at build time)  |
| `VITE_DEV_API_PROXY_TARGET`   | Where `vite dev` proxies `/api` to, during local development       |

### Compose-only (root `.env.example`)

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`,
`BACKEND_UPSTREAM` (host:port the Nginx container proxies to).

---

## 5. PostgreSQL migrations and seeding

Migrations live in `backend/src/db/migrations/NNN_description.sql`, applied **in filename order** by
`backend/src/db/migrate.ts`, which tracks applied files in a `schema_migrations` table — safe to re-run.

```bash
cd backend
npm run migrate     # tsx src/db/migrate.ts
npm run seed         # tsx src/db/seed/run-seed.ts (runs migrate first, then upserts seed data)
```

The seed script is **idempotent**: categories/sellers/customers/products are upserted by their natural unique
key (`slug`/`email`), and the one demo order is only created if it doesn't already exist. Running it twice
produces the same row counts both times (verified during validation — see below).

Because migrations and the seed script only depend on `DATABASE_URL`, the DevOps team can run them as a
Kubernetes `Job`/`initContainer` against the PostgreSQL StatefulSet independently of the backend Deployment.

---

## 6. API endpoints

All resource endpoints are mounted under `/api`. `/health`, `/ready` and `/metrics` are mounted at the root
(not under `/api`) so platform probes and scrapers can reach them directly without going through the API prefix.

| Method | Path                         | Auth           | Description                                   |
|--------|-------------------------------|----------------|------------------------------------------------|
| GET    | `/health`                     | none           | Liveness probe                                 |
| GET    | `/ready`                      | none           | Readiness probe (checks PostgreSQL connectivity) |
| GET    | `/metrics`                    | none           | Prometheus-formatted metrics                   |
| POST   | `/api/auth/register`           | none           | Register as customer or seller                 |
| POST   | `/api/auth/login`               | none           | Login, returns JWT                              |
| GET    | `/api/auth/me`                 | Bearer         | Current user profile                            |
| GET    | `/api/categories`               | none           | List categories with product counts             |
| GET    | `/api/categories/:id`           | none           | Category detail                                 |
| GET    | `/api/products`                 | none           | Search/filter/sort/paginate products             |
| GET    | `/api/products/:id`             | none           | Product detail                                  |
| POST   | `/api/products`                 | seller/admin   | Create a product                                |
| PUT    | `/api/products/:id`              | owning seller/admin | Update a product                           |
| DELETE | `/api/products/:id`              | owning seller/admin | Archive a product                          |
| GET    | `/api/inventory/:productId`     | owning seller/admin | Read stock levels                          |
| PUT    | `/api/inventory/:productId`     | owning seller/admin | Adjust stock / reorder threshold           |
| GET    | `/api/cart`                      | customer       | Get (or create) the current cart                |
| POST   | `/api/cart/items`                 | customer       | Add an item to the cart                         |
| PUT    | `/api/cart/items/:id`             | customer       | Update line item quantity                       |
| DELETE | `/api/cart/items/:id`             | customer       | Remove a line item                              |
| POST   | `/api/orders`                     | customer       | Checkout — simulated payment, decrements stock  |
| GET    | `/api/orders`                     | customer       | Order history                                   |
| GET    | `/api/orders/:id`                  | owner/admin    | Order detail                                    |
| GET    | `/api/orders/:id/tracking`          | owner/admin    | Order tracking timeline                         |
| PATCH  | `/api/orders/:id/status`            | seller/admin   | Update order/tracking status                    |
| GET    | `/api/sellers/me`                   | seller         | Own seller profile                              |
| GET    | `/api/sellers/me/products`            | seller         | Own product listings                            |
| GET    | `/api/sellers/me/orders`               | seller         | Orders containing own products                 |
| GET    | `/api/sellers/me/summary`               | seller         | Revenue/units-sold summary                      |
| GET    | `/api/sellers/:id`                       | none           | Public seller/storefront info                   |
| GET    | `/api/dashboard/stats`                    | admin          | Platform-wide revenue/orders/top-products stats |

All mutating endpoints validate input with `zod` and return `400` with field-level details on failure; errors
follow a consistent `{ error: { code, message, requestId } }` shape. Every response carries an `X-Request-Id`
header for correlating logs across a request.

---

## 7. Testing

```bash
cd backend
npm run lint              # ESLint (flat config, typescript-eslint)
npm test                  # vitest unit tests — mocked pg Pool, no DB needed
npm run test:coverage     # unit tests + LCOV/HTML coverage report -> backend/coverage/lcov.info
npm run test:integration  # supertest against a REAL PostgreSQL (set DATABASE_URL, JWT_SECRET)
npm run build             # tsc -> dist/

cd frontend
npm run lint
npm test
npm run test:coverage     # -> frontend/coverage/lcov.info
npm run build             # tsc -b && vite build -> dist/
```

Integration tests need a real PostgreSQL reachable at `DATABASE_URL` (migrations are applied automatically by
a Vitest global setup hook). In CI, run a `postgres:16-alpine` service container and point `DATABASE_URL` at it;
locally:

```bash
docker run -d --rm --name nexamarket-test-pg -p 55432:5432 \
  -e POSTGRES_USER=nexamarket -e POSTGRES_PASSWORD=test -e POSTGRES_DB=nexamarket_test \
  postgres:16-alpine

cd backend
DATABASE_URL=postgres://nexamarket:test@localhost:55432/nexamarket_test \
JWT_SECRET=integration-test-secret-key-0123456789 \
npm run test:integration
```

Both `backend/coverage/lcov.info` and `frontend/coverage/lcov.info` are standard LCOV, consumable directly by
SonarQube's `sonar.javascript.lcov.reportPaths` / `sonar.typescript.lcov.reportPaths` properties.

`package-lock.json` is committed for both `backend/` and `frontend/` so CI can use `npm ci` for reproducible,
audited installs.

---

## 8. Docker & Docker Compose

Both services build as multi-stage, non-root images:

- **backend/Dockerfile**: `node:20-alpine` → compiles TypeScript → production-only `npm ci --omit=dev` stage →
  final runtime stage running as a dedicated `nexamarket` user, with a container `HEALTHCHECK` against `/health`.
- **frontend/Dockerfile**: `node:20-alpine` builds the Vite bundle (with build-arg `VITE_API_URL`) → final stage
  is `nginxinc/nginx-unprivileged:1.27-alpine` (runs as non-root `nginx` user, listens on `8080`), serving the
  static bundle and reverse-proxying `/api/*` to a **configurable** upstream (`BACKEND_UPSTREAM` env var,
  templated into `nginx/default.conf.template` via Nginx's built-in `envsubst` templating — no hardcoded hosts).

### Run the full stack locally

```bash
cp .env.example .env     # fill in a real JWT_SECRET and POSTGRES_PASSWORD
docker compose build
docker compose up -d postgres
docker compose run --rm migrate
docker compose up -d backend frontend
docker compose --profile seed run --rm seed    # optional: load 42 demo products
```

- Frontend: http://localhost:8080 (or `$FRONTEND_PORT`)
- Backend direct: http://localhost:4000 (or `$BACKEND_PORT`)
- Postgres: localhost:5432 (or `$POSTGRES_PORT`)

`docker compose down -v` stops everything and removes the Postgres volume.

This exact sequence (build → up postgres → migrate → up backend/frontend → seed → curl `/health`, `/ready`,
`/api/categories` through the Nginx proxy, verify non-root `id` inside both containers) was run during
validation for this handover — see the [handover report](#handover-to-devops) for the actual output.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend exits immediately with "Invalid environment configuration" | Missing/short `JWT_SECRET` or missing `DATABASE_URL` | Check `.env` against `backend/.env.example` |
| `GET /ready` returns `503` | PostgreSQL unreachable | Check `DATABASE_URL`, confirm the `postgres` container/service is healthy |
| `docker compose up` fails with "address already in use" | A host port (8080/4000/5432) is already taken | Override `FRONTEND_PORT` / `BACKEND_PORT` / `POSTGRES_PORT` in `.env` |
| Frontend loads but API calls 404/CORS-fail | `VITE_API_URL` baked in at build time doesn't match how Nginx is proxying, or `CORS_ORIGIN` on the backend doesn't include the frontend origin | Rebuild frontend with the correct `VITE_API_URL` build-arg; set `CORS_ORIGIN` |
| `npm run test:integration` hangs or fails to connect | No PostgreSQL reachable at `DATABASE_URL` | Start a test Postgres container (see Testing section) before running |
| Seed script errors on first run only | Migrations not applied yet | `npm run seed` runs migrations first automatically — check `DATABASE_URL` is correct |
| 401 on endpoints that should be public | Stale/invalid bearer token sent by the frontend | Clear `localStorage` (`nexamarket.token`) and log in again |

---

## Handover to DevOps

The DevOps team owns everything downstream of this repository's `main` branch: GitHub Actions CI/CD, SonarQube
quality gates, Trivy image scanning, AWS IAM/OIDC, Amazon ECR, Terraform, Amazon EKS, the PostgreSQL
StatefulSet (StorageClass/PVC/PV/EBS CSI), Helm charts, Argo CD, ALB/Ingress, Route 53/HTTPS, Prometheus/Grafana,
PagerDuty and disaster recovery. None of that is implemented in this repository by design.

What this repo hands off, ready to consume:

- Two Dockerfiles producing non-root, minimal images with container healthchecks.
- `/health`, `/ready` and `/metrics` for liveness/readiness probes and Prometheus scraping.
- Standalone, idempotent migration (`backend/src/db/migrate.ts`) and seed (`backend/src/db/seed/run-seed.ts`)
  scripts that only need `DATABASE_URL` — runnable as a Kubernetes Job against the StatefulSet independently
  of app deploys.
- `npm ci`-compatible `package-lock.json` in both `backend/` and `frontend/`.
- LCOV coverage output for SonarQube ingestion.
- `.env.example` files (root, backend, frontend) documenting every required variable with no real secrets.

See the full development handover report for exact commands executed, actual test results, and known
remaining issues.
