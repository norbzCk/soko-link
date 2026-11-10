# Backend File Guide

This guide explains what every source file under `backend/` is responsible for,
in plain language. Use it when you are new to the project, when you need to find
the right place to make a change, or when you are reviewing a backend change.

The backend is one deployable FastAPI application, but it is organised like a
set of small services. `backend/api/main.py` is the front door: it creates the
app and connects the routers. Each router delegates real work to a service
package, and every service uses the shared database, models and utilities.

## How a request flows

```text
HTTP request
    |
    v
backend/api/main.py  (FastAPI app, CORS, rate limiting, static files)
    |
    v
a router in backend/services/<capability>/ or backend/api/routers/
    |
    v
service helpers in the same package
    |
    v
backend/shared/models.py + backend/shared/database.py
    |
    v
PostgreSQL in production, SQLite in local development
```

The most important rule is that **routers translate HTTP, while services hold
business rules**. If you are changing a rule such as who may cancel an order or
how revenue is calculated, look in the service helper rather than in the router.

## Route prefix quick reference

| Prefix | Owning file | Main audience |
| --- | --- | --- |
| `/auth` | `services/identity/auth.py` | All users: login, registration, verification, roles |
| `/customers` | `services/identity/customers.py` | Legacy customer administration |
| `/products` | `services/catalog/products.py` | Public catalogue and seller/admin product management |
| `/providers` | `services/catalog/providers.py` | Supplier directory |
| `/rfq` | `services/catalog/rfq.py` | Public RFQ submission and admin RFQ review |
| `/sales`, `/orders` | `services/orders/sales.py` | Customer checkout and order lifecycle |
| `/payments` | `services/payments/payments.py` | Payment initiation, status and provider callbacks |
| `/business` | `services/sellers/business.py` | Established seller/business API |
| `/seller` | `services/sellers/workspace.py` | Dedicated seller workspace |
| `/logistics` | `services/delivery/logistics.py` | Delivery partner operations |
| `/notifications` | `services/notifications/notifications.py` | Notification feed and live delivery WebSocket |
| `/disputes` | `services/disputes/router.py` | Admin dispute management |
| `/ai` | `services/intelligence/ai_assistant.py` | AI assistant chat and history |
| `/dashboard` | `api/routers/analytics.py` | Admin/analyst analytics |
| `/marketplace` | `api/routers/marketplace.py` | Public marketplace trends |
| `/superadmin` | `api/routers/admin.py` | Superadmin/owner operations |
| `/healthz` | `api/routers/health.py` | Health checks |
| `/` | `api/routers/frontend.py` | Built frontend application and SPA fallback |

## Directory map

| Path | Purpose |
| --- | --- |
| `backend/api/` | Application composition and gateway-only routes. Startup does not seed or patch the database schema. |
| `backend/services/` | Business capabilities: identity, sellers, catalog, orders, payments, delivery, notifications, intelligence and disputes. |
| `backend/shared/` | Database setup, SQLAlchemy models, shared request/response schemas and small utilities. |
| `backend/scripts/` | Operational scripts for bootstrapping, DDL export and Supabase synchronisation. |
| `backend/uploads/` | Runtime image files created by older upload paths. Not source code. |
| `backend/railway.toml` | Railway deployment build and start commands. |

## Root and configuration files

### `backend/__init__.py`

Marks `backend` as a Python package so imports such as
`from backend.shared.database import get_db` work.

### `backend/.gitignore`

An empty placeholder. Repository-level ignore rules currently live in the
root `.gitignore`.

### `backend/railway.toml`

Railway deployment configuration. It tells Railway to install
`requirements.txt` with Nixpacks and to start the API with
`uvicorn backend.api.main:app` on the port Railway provides.

## `backend/api` - application gateway

### `backend/api/__init__.py`

Package marker with a one-line description: this directory is the FastAPI
gateway and composition root.

### `backend/api/main.py`

The entry point of the backend. It:

- loads the root `.env` file;
- creates the `FastAPI` application;
- configures CORS from `CORS_ORIGINS` / `FRONTEND_URL`;
- installs the shared rate limiter from the identity service;
- mounts `backend/uploads` at `/uploads`;
- includes every service router and gateway router;
- uses an empty lifespan: migrations and account/data setup are explicit
  operator actions, not API startup side effects.

**Start here when:** you are adding a new router to the application, changing
CORS, changing startup behaviour, or debugging why a route is not reachable.

### `backend/api/README.md`

Short operator/developer notes for the gateway package. It explains the roles of
`main.py`, `routers/`, and the legacy compatibility helper, plus the local run command.

### `backend/api/schema.py`

A legacy schema patch helper retained for tests and compatibility references.
Production startup does not import or call it. New permanent schema changes
must use Alembic; do not reintroduce this helper into application startup.

Do not add production startup behavior here. Permanent database changes belong
in a reviewed Alembic migration.

### Demo data and `backend/api/seed.py`

The former demo seeder has been removed. API startup creates no sample users,
sellers, products, or sales. Tests should create only the fixtures they need;
development accounts should be provisioned through an explicit bootstrap
workflow rather than hardcoded demo credentials.

### `backend/api/routers/__init__.py`

Package marker for gateway-owned routers.

### `backend/api/routers/admin.py`

Superadmin and owner operations. This router covers:

- platform statistics and the current superadmin profile;
- creating, listing, editing, verifying, suspending and deleting sellers,
  customers and logistics accounts;
- reviewing business and logistics verification requests;
- approving, rejecting or archiving products in the moderation queue;
- reviewing seller payout requests and payout accounts;
- resolving seller review reports;
- sending notifications to sellers when moderation actions occur.

All routes require a superadmin/owner role. Most route paths begin with
`/superadmin`.

**Touch this when:** an administrator needs to manage accounts, moderate
products, process payouts or resolve review reports.

### `backend/api/routers/analytics.py`

Administrator/analyst dashboard endpoints under `/dashboard`. It exposes sales
statistics, revenue by product, revenue over time, recent sales, the combined
analytics payload, market insights and a CSV sales export.

The heavy calculation lives in `backend/services/intelligence/dashboard.py` and
`backend/services/intelligence/analysis/sales_analysis.py`; this file adapts
those functions to HTTP and enforces allowed roles.

### `backend/api/routers/frontend.py`

Serves the built React application from `frontend/dist`. It serves
`index.html` at `/`, real static assets when they exist, and falls back to
`index.html` for client-side routes. It is included last so API routes take
priority.

If the backend returns "Frontend build not found", run the frontend production
build first.

### `backend/api/routers/health.py`

Provides `GET /healthz`, which runs `SELECT 1` against the database. It is used
by hosting platforms and operators to check that the API and database are alive.

### `backend/api/routers/marketplace.py`

Provides `GET /marketplace/trends`, a public endpoint for marketplace-wide trends
such as popular categories and demand signals. The calculation is implemented
in `backend/services/intelligence/marketplace_intelligence.py`.

## `backend/shared` - shared kernel

### `backend/shared/__init__.py`

Package marker describing this directory as the shared kernel.

### `backend/shared/database.py`

Creates the SQLAlchemy engine and session factory. It:

- resolves `DATABASE_URL` when supplied;
- converts old `postgres://` / `postgresql://` URLs to the Psycopg2 driver;
- repairs passwords that were not URL-encoded;
- adds `sslmode=require` for remote PostgreSQL/Supabase hosts;
- uses local PostgreSQL environment variables when `DATABASE_URL` is absent;
- requires a configured PostgreSQL password rather than falling back to SQLite;
- exposes `get_db()`, the FastAPI dependency that opens and closes one session
  per request.

**Touch this when:** you need a database connection, a session in a script, or
you are debugging connection-string problems.

### `backend/shared/models.py`

The single source of truth for database tables. It defines `Base` and every
SQLAlchemy ORM model, including:

- **People and access:** `Identity`, `IdentityRole`, `RoleApplication`,
  `VerificationToken`, `User`, `RefreshToken`, `TokenBlocklist`.
- **Sellers:** `BusinessUser`, `BusinessVerification`, `BusinessMetrics`,
  `SellerPayoutAccount`, `SellerPayout`, `Promotion`, `ReviewReply`,
  `ReviewReport`.
- **Catalogue:** `Product`, `Provider`, `RFQ`, `Quotation`, `QuotationEvent`,
  `RFQClarification`.
- **Orders and fulfilment:** `Sale` (the legacy/commercial order record),
  `Order`, `OrderItem`, `OrderStatusHistory`, `InventoryReservation`,
  `InventoryMovement`, `DeliveryOrder`, `ShipmentEvent`.
- **Conversations:** `ConversationThread`, `ConversationParticipant`,
  `ConversationMessage`, `MessageReceipt`.
- **Payments and audit:** `PaymentTransaction`, `PaymentAttempt`, `AuditLog`.
- **Disputes and notifications:** `Dispute`, `DisputeMessage`, `Notification`.
- **AI assistant:** `AssistantConversation`, `AssistantConversationMessage`.
- **Legacy customer records:** `Customer`.

**Touch this when:** you add or change a persistent field/table. Add a reviewed
Alembic migration; the legacy helper is not part of production startup.

### `backend/shared/schemas/__init__.py`

Re-exports the public Pydantic schemas from `product.py`, so services can import
them with a short `from backend.shared.schemas import ...`.

### `backend/shared/schemas/product.py`

Despite the filename, this file contains most shared request/response DTOs, not
only product schemas. It defines product search/create/AI suggestion models,
customer and RFQ models, provider models, payment models, and seller/logistics
registration, profile, verification and delivery models.

**Touch this when:** an API request or response shape is shared by more than one
service. Service-specific DTOs can stay inside that service.

### `backend/shared/utils/__init__.py`

Package marker for shared helpers.

### `backend/shared/utils/geo.py`

Small geo helpers used by delivery and marketplace features:

- `coords_for_location()` maps known Dar es Salaam areas to coordinates;
- `haversine_km()` calculates distance between two points;
- `interpolate_coords()` estimates a point along a route for tracking.

### `backend/shared/utils/text.py`

Two tiny text helpers: `clean_text()` collapses whitespace, and
`normalize_lookup_key()` lowercases cleaned text for comparisons.

### `backend/shared/utils/uploads.py`

Validates uploaded images and returns them as base64 data URIs stored directly
in database columns. It accepts JPG, PNG, WEBP and GIF up to 2 MB. This avoids
running a separate file-storage service, at the cost of larger database rows.

**Touch this when:** upload validation or the maximum image size needs to
change. If you introduce real object storage later, this is the file to replace.

## `backend/services` - business capabilities

### `backend/services/__init__.py`

Package marker describing the service packages mounted by the gateway.

### `backend/services/README.md`

Explains the service-folder convention: each capability exports a `router`, only
public helpers should cross service boundaries, and services must not import
from `backend.api`.

### `backend/services/catalog` - products, suppliers and RFQs

#### `backend/services/catalog/__init__.py`

Package marker.

#### `backend/services/catalog/products.py`

Product catalogue API under `/products`. It handles:

- public browsing, search, filtering, categories and marketplace listings;
- seller/admin product management, including soft delete and reactivation;
- product image upload;
- AI-assisted product descriptions and pricing suggestions;
- inventory statistics and cart optimisation.

Seller ownership checks prevent one seller from editing another seller's
products. Public endpoints hide inactive products; management endpoints keep
them visible so sellers can restore them.

The newer `/seller/products` endpoints in
`backend/services/sellers/workspace.py` cover the dedicated seller workspace.
This router remains the general/public catalogue API.

#### `backend/services/catalog/providers.py`

Supplier/provider directory under `/providers`. Public users can view verified
suppliers; authenticated users can see the directory and profiles; admins can
create, update and delete supplier records.

#### `backend/services/catalog/rfq.py`

Public request-for-quotation (RFQ) API under `/rfq`. Buyers submit sourcing
requests, while admins can list RFQs and change their status. Seller-side RFQ
inbox, quotations and clarification answers live in the seller workspace.

### `backend/services/delivery` - logistics partners and deliveries

#### `backend/services/delivery/__init__.py`

Package marker.

#### `backend/services/delivery/logistics.py`

The logistics API under `/logistics`. It covers the full delivery-partner
lifecycle:

- registration, login, profile, verification documents and password changes;
- online/offline status and availability;
- creating delivery jobs and listing assigned deliveries;
- pickup, transit, delivery-failure and proof-of-delivery status changes;
- live tracking, public tracking links and delivery ratings;
- notifications to buyers and sellers at delivery events.

It also coordinates order status changes with the shared order lifecycle so a
delivery action cannot silently leave the order in an inconsistent state.

### `backend/services/disputes` - dispute workflow

#### `backend/services/disputes/__init__.py`

Package marker.

#### `backend/services/disputes/router.py`

Administrator-facing dispute API under `/disputes`. Admins can list, inspect,
create, update and delete disputes, validate statuses, set resolution times, and
notify the buyer and seller. Seller-side dispute creation and messaging live in
`backend/services/sellers/workspace.py`.

#### `backend/services/disputes/schemas.py`

Pydantic models for creating, updating and returning disputes. Kept local
because the dispute shape is only used by this capability.

### `backend/services/identity` - authentication and access control

#### `backend/services/identity/__init__.py`

Package marker.

#### `backend/services/identity/auth.py`

The largest identity module and the heart of authentication. It provides:

- password hashing, verification and rehashing;
- access and refresh JWT creation, decoding, rotation and revocation;
- HTTP bearer and cookie authentication;
- `get_current_user`, `get_optional_current_user`, `get_user_from_token` and
  `require_roles`, which other routers use for authorization;
- customer, seller and logistics login flows with verification/status checks;
- email verification links and OTPs, phone OTPs, password recovery and reset;
- unified identity creation, role switching, role applications and admin role
  assignment;
- profile updates, profile-photo upload and password changes;
- admin user management;
- Supabase account linking and current-user resolution;
- the shared SlowAPI limiter used by the application.

**Touch this when:** you are changing login, tokens, roles, verification,
password rules, session revocation or any authentication dependency.

#### `backend/services/identity/customers.py`

A small legacy/admin customer API under `/customers`. It lists and creates
`Customer` records and is restricted to superadmin/owner roles. Most current
customer behaviour uses `User` and `Identity` instead.

#### `backend/services/identity/identity_service.py`

A framework-independent IAM toolkit. It contains no FastAPI dependencies so it
can be reused by auth routes, admin routes, migrations and tests. It manages:

- canonical roles and legacy role aliases;
- account and application status constants;
- token/OTP creation, hashing and consumption;
- identity-role assignment and approval checks;
- profile lookup and creation for each role;
- identity serialization and audit logging.

Keeping this file free of HTTP code is deliberate: it prevents circular imports
and keeps IAM rules usable outside a request.

#### `backend/services/identity/supabase_auth.py`

Optional Supabase Auth bridge. It verifies Supabase-issued JWTs against the
project's JWKS endpoint, determines whether the token belongs to a customer,
seller, logistics partner or superadmin, and maps the Supabase user to the local
app user. This lets the frontend use Supabase Auth while the FastAPI backend
still applies its own authorization and database rules.

Requires `SUPABASE_URL` (and optionally `SUPABASE_JWKS_URL`).

### `backend/services/intelligence` - analytics, insights and AI

#### `backend/services/intelligence/__init__.py`

Package marker.

#### `backend/services/intelligence/agent_tools.py`

Defines the tools the AI assistant may call to perform real actions, such as
searching products, reading a user's orders/products, rating an order,
confirming receipt, deactivating or reactivating a product, creating a product,
or updating an order status. Each tool is a thin wrapper around the existing
service function so the assistant cannot bypass ownership checks or business
rules. It also classifies tools as safe read-only actions versus actions that
need confirmation.

**Touch this when:** the AI assistant should gain a new safe action.

#### `backend/services/intelligence/ai_assistant.py`

The AI assistant API under `/ai`. It builds role-aware context, loads the system
instructions, calls OpenAI or Gemini when configured, falls back to a
rule-based reply otherwise, stores conversation history, and returns history for
the chat UI.

**Touch this when:** you are changing assistant prompts, model providers,
conversation persistence or role-specific assistant behaviour.

#### `backend/services/intelligence/assistant_knowledge/company_information.md`

Reference facts about SokoLink that are injected into the assistant's context:
what the platform does, who its users are, and how its main workflows operate.
It is content, not executable code.

#### `backend/services/intelligence/assistant_knowledge/system_instructions.md`

The assistant's behavioural instructions: tone, safety boundaries, what it may
claim, when it should ask for confirmation, and how it should use tools. Edit
carefully because this directly changes assistant behaviour.

#### `backend/services/intelligence/analysis/__init__.py`

Package marker for analysis helpers.

#### `backend/services/intelligence/analysis/sales_analysis.py`

Pure sales-analysis functions used by dashboards and the business API. It
calculates inventory forecasts and burn rates, dashboard totals, revenue by
product and over time, market and pricing insights, demand forecasts, peak sales
periods and customer buying patterns.

#### `backend/services/intelligence/dashboard.py`

Builds the administrator/analyst dashboard payload. It scopes sales to the
current user, computes statistics, optionally uses pandas for analysis, and can
generate SVG revenue graphs with matplotlib when those libraries are installed.
The graph files are written under an uploads directory and exposed by URL.

#### `backend/services/intelligence/marketplace_intelligence.py`

Cross-cutting marketplace intelligence used by several services. It builds:

- AI product insights (description, pricing, keywords, demand estimate);
- seller badges based on ratings, sales and delivery performance;
- refreshed business metrics;
- delivery tracking payloads and map-style route progress;
- cart optimisation suggestions;
- public marketplace trends;
- the superadmin overview.

### `backend/services/notifications` - in-app and email notifications

#### `backend/services/notifications/__init__.py`

Package marker.

#### `backend/services/notifications/notification_service.py`

The reusable notification engine. It resolves the correct recipient subject
(customer, seller, logistics or superadmin), creates notification rows, sends
optional emails through SMTP, lists unread notifications, marks them read, and
provides email templates for login and password reset. When SMTP is not
configured it logs instead of sending.

**Touch this when:** any service needs to notify a user, or email templates and
SMTP behaviour need to change.

#### `backend/services/notifications/notifications.py`

The notifications API under `/notifications`, plus the real-time WebSocket
endpoint `/notifications/ws/delivery/{order_id}`. It exposes the notification
feed and summary, mark-as-read actions, and a connection manager that keeps
buyers, sellers and riders in sync for order chat and delivery updates.

### `backend/services/orders` - checkout and order lifecycle

#### `backend/services/orders/__init__.py`

Package marker.

#### `backend/services/orders/order_runtime.py`

Shared runtime plumbing for orders and deliveries. It records audit entries and
order status history, reserves and releases inventory, records shipment events,
creates order conversation threads, stores conversation messages, updates
delivery/read receipts, and serializes messages for the API.

**Touch this when:** you need to add an order event, audit trail entry,
inventory reservation or chat message behaviour.

#### `backend/services/orders/order_state.py`

The single source of truth for order status rules. It defines all valid statuses,
the allowed transitions between them, customer-cancellable states, which
payments count as settled, and how a `Sale` status is synchronised to its linked
`Order` and `OrderItem` records. It also writes the status history and audit log.

**Touch this when:** you are changing what statuses exist or which transitions
are legal. Do not duplicate transition rules in individual routers.

#### `backend/services/orders/sales.py`

The customer checkout and order API. Its routes are mounted at `/sales` and
`/orders` (no router prefix). It handles:

- listing a user's sales/orders and creating a checkout order;
- calculating totals, delivery fees and inventory changes;
- ownership checks and notifications to buyers/sellers;
- order status updates, receipt confirmation, cancellation and rating;
- order tracking.

It uses `order_state.py` for lifecycle rules and `order_runtime.py` for audit,
inventory and history.

### `backend/services/payments` - transactions and mobile money

#### `backend/services/payments/__init__.py`

Package marker.

#### `backend/services/payments/payments.py`

Payment API under `/payments`. It:

- lists public and authenticated payment methods;
- initiates bank transfer, cash, credit and mobile-money payments;
- creates payment transactions and attempts with idempotency protection;
- starts mobile-money pushes;
- exposes transaction status and confirmation endpoints;
- handles M-Pesa, Airtel and Tigo Pesa webhooks;
- provides a polling fallback for providers with unreliable callbacks;
- automatically advances an order only after a provider confirms payment, while
  leaving seller fulfilment steps intact;
- notifies buyers and sellers about payment events.

#### `backend/services/payments/providers/__init__.py`

Registers the provider implementations (`mpesa`, `airtel_money`, `tigopesa`) and
exposes `get_provider()`. Other code asks this registry for a provider instead
of importing a concrete adapter directly.

#### `backend/services/payments/providers/base.py`

Defines the provider contract:

- `MobileMoneyProvider` with `push_payment()` and `verify_webhook()`;
- `PushResult` for an accepted USSD/STK push;
- `WebhookResult` for a verified callback;
- `PaymentProviderError` for provider failures.

The design ensures a push only means "accepted for processing", never "paid";
only a verified callback or status poll can complete a transaction.

#### `backend/services/payments/providers/mpesa_service.py`

Vodacom Tanzania M-Pesa Open API adapter. It handles OAuth/token acquisition,
API-key encryption where required, push requests, status queries and webhook
verification/normalisation. It is specifically the Tanzanian Vodacom Open API,
not Safaricom's Kenyan Daraja API.

#### `backend/services/payments/providers/airtel_service.py`

Airtel Money adapter. It performs the OAuth2 client-credentials flow, sends
collection/push requests, checks status, and normalises Airtel callbacks.

#### `backend/services/payments/providers/tigopesa_service.py`

Tigo Pesa adapter. Direct Tigo/MIC merchant API access requires a commercial
agreement, so this implementation represents a generic aggregator-style
interface. Update it to match the chosen aggregator (for example Selcom,
ClickPesa, DPO or AzamPay) before going live.

#### `backend/services/payments/providers/README.md`

Important operational notes for payments: the real push-then-webhook flow,
per-provider sandbox access, callback configuration, security checklist and the
difference between mobile money and manual bank/cash flows.

### `backend/services/sellers` - seller and business operations

#### `backend/services/sellers/__init__.py`

Package marker.

#### `backend/services/sellers/business.py`

The established `/business` API for seller/business accounts. It handles:

- seller registration and login, profile edits, photo upload and verification;
- seller dashboard overview, inventory overview, analytics and market share;
- seller order decisions, status changes, delivery assignment and delivery
  instructions;
- seller notifications and communication feed;
- bulk product creation;
- public seller profiles and seller directory.

It also contains shared seller helpers (`_serialize_business`,
`_seller_sales_query`, `_inventory_overview`, `_serialize_seller_order`,
`_ensure_order_owner`) that the newer seller workspace reuses. The legacy
`/business` paths remain for compatibility.

#### `backend/services/sellers/workspace.py`

The dedicated seller workspace API under `/seller`. Every route is scoped to the
authenticated business account, and every resource ID is re-checked against that
seller before data is returned or changed.

It covers:

- dashboard, profile, verification and settings;
- product drafts, moderation submission, archiving, restoring and duplication;
- inventory levels, alerts, movements and adjustments;
- orders, status transitions, delivery assignment, deliveries and instructions;
- RFQ inbox, quotations, withdrawal and clarification questions;
- customers and customer history;
- conversation threads and messages;
- reviews, seller replies and review reports;
- promotions with validity and discount limits;
- sales analytics and CSV export;
- finance overview, transactions, payout accounts and payout requests;
- disputes and dispute messages;
- password changes and session revocation.

**This is the main file for seller-facing behaviour.** When a seller feature
needs a new endpoint, add it here unless it genuinely belongs to a shared
cross-role service.

## `backend/scripts` - operational tools

### `backend/scripts/__init__.py`

Package marker for operational scripts.

### `backend/scripts/init_db.py`

Compatibility command for applying the Alembic migrations to the configured
database. It does not create tables outside migration history or seed sample
records. Use `python -m backend.scripts.bootstrap_users` to create the three
operator-configured first accounts after migrations.

### `backend/scripts/generate_sql_schema.py`

Generates a PostgreSQL/Supabase DDL file from the SQLAlchemy models. It is useful
when setting up a fresh Supabase project or reviewing the physical schema. Run
it with `python -m backend.scripts.generate_sql_schema [output_file]`.

### `backend/scripts/supabase_sync.py`

Copies data between the configured local database and Supabase. `push` moves
local data to Supabase; `pull` moves Supabase data back. It truncates destination
tables before copying, so treat it as a destructive maintenance tool and always
try `--dry-run` first.

## Runtime and generated files

### `backend/uploads/`

Contains images created by older upload paths. These files are runtime data, not
source code. Current image uploads are usually stored as base64 data URIs in the
database through `backend/shared/utils/uploads.py`.

### `backend/**/__pycache__/`

Python bytecode generated automatically when modules run. Never edit these
files and never commit them. They can be deleted safely.

## Where should I make a change?

| I need to... | Start here |
| --- | --- |
| Add or change a public API route | The owning service router, then register it in `backend/api/main.py` if it is a new router |
| Add a seller workspace endpoint | `backend/services/sellers/workspace.py` |
| Change an order status rule | `backend/services/orders/order_state.py` |
| Change checkout, cancellation or receipt behaviour | `backend/services/orders/sales.py` |
| Add a database field or table | `backend/shared/models.py` and a reviewed Alembic migration |
| Change login, roles or permissions | `backend/services/identity/auth.py` and `backend/services/identity/identity_service.py` |
| Add a payment provider | `backend/services/payments/providers/` and register it in `providers/__init__.py` |
| Change payment settlement behaviour | `backend/services/payments/payments.py` |
| Add a notification or email template | `backend/services/notifications/notification_service.py` |
| Change dashboards or analytics | `backend/services/intelligence/dashboard.py` and `analysis/sales_analysis.py` |
| Change the AI assistant's behaviour | `backend/services/intelligence/ai_assistant.py` plus the Markdown files under `assistant_knowledge/` |
| Change delivery tracking | `backend/services/delivery/logistics.py` and `backend/shared/utils/geo.py` |
| Add test data | Test-local fixtures; there is no application demo seeder |

## Conventions to keep in mind

1. **Keep HTTP code and business rules separate.** Routers validate HTTP input
   and call service helpers. Shared rules belong in service modules.
2. **Do not trust an ID from the client.** Seller, order, delivery, dispute and
   thread routes must verify ownership before returning or mutating data.
3. **Use the shared order state machine.** Do not invent status transitions in a
   new endpoint.
4. **Use the notification service.** Avoid writing notification rows by hand in
   feature code.
5. **Use Alembic for permanent schema changes.** `api/schema.py` and
   `scripts/init_db.py` are legacy compatibility tools, not a replacement for
   migrations.
6. **Keep imports pointing downward.** Services may import from `backend.shared`;
   services should not import from `backend.api`.
7. **Never commit secrets or runtime databases.** Use `.env.example` for
   documented configuration and keep real credentials out of Git.

When you add, remove or substantially change a backend file, update this guide
so the next person can still find their way around.
