# Soko-Link System Architecture

**Document:** `Architecture.md`\
**Status:** Current implementation baseline --- verified against the
repository and a successful frontend production build on 7 November 2026\
**Owner:** Soko-Link Engineering\
**Last updated:** 7 November 2026

> **Contributor contract --- read this first**
>
> This document describes what exists **now**. It is not a proposal to
> re-platform, reorganise, or rewrite the project. Start every change
> from the current structure below and extend it in place.
>
> - Do not replace working modules, rename public API paths, move
>   directories to match an older draft, or recreate the design system.
> - Preserve the current frontend/backend contracts, roles, payment
>   states, and fulfilment rules unless the pull request includes an
>   explicit migration plan and tests.
> - Classify every capability as **Implemented**, **Partially
>   implemented**, **Planned**, or **Unverified**; never present planned
>   work as existing behaviour.
> - The code and tests are authoritative. If this document and the code
>   disagree, fix both in the same pull request.
> - Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the required workflow.

## 1. Purpose and accuracy statement

This document describes the system architecture and engineering
principles for Soko-Link. It is intended for developers, reviewers,
operators, and AI coding agents.

The current verified baseline is:

- **One FastAPI modular-monolith gateway** (`backend/api/main.py`) that
  mounts capability routers from `backend/services/*`.
- **One React + TypeScript + Vite SPA** (`frontend/`) that talks to the
  gateway over JSON/HTTP and stores the session in secure cookies.
- **One relational database** --- PostgreSQL is the production target;
  SQLite is supported for local development and the automated test
  suite. Alembic is the schema-evolution mechanism.
- **Docker/Compose, Render, Railway, Netlify, and GitHub Pages
  configuration files exist**, but their live deployment status is
  unverified. A configuration file is not proof that a service is
  running or healthy.

Some integrations are deliberately incomplete or environment-dependent
(notably mobile-money production credentials, SMTP delivery, and durable
file storage). Those cases are marked explicitly below.

Mark each capability as implemented, partial, planned, or unverified. Do
not infer production readiness from the presence of a dependency,
configuration file, or UI screen.

## 2. Architecture principles

1.  **Modular monolith first:** keep a coherent deployable backend with
    explicit domain boundaries until scale or team needs justify service
    separation.
2.  **Security at the server:** frontend checks improve usability;
    backend authorization and validation enforce policy.
3.  **Business rules have one authoritative home:** critical rules
    belong in backend domain/application logic and database constraints
    where appropriate.
4.  **Financial correctness:** payment, order, inventory, and refund
    operations require transactions, idempotency, and auditability.
5.  **Explicit contracts:** frontend and backend communicate through
    documented, validated API contracts.
6.  **Configuration outside source:** secrets are injected through
    environment or secret-management systems.
7.  **Observable operations:** logs, metrics, health checks, backups,
    and alerts are part of production engineering.
8.  **Incremental evolution:** refactor in tested steps; avoid large
    rewrites without evidence.

## 3. System context

### 3.1 Logical context

``` mermaid
flowchart TD
    Actors[Customers, Sellers, Logistics, Admins, Analysts]
    Browser[Web Browser / Responsive Frontend]
    API[Backend API]
    DB[(Relational Database)]
    Providers[External Providers]
    Files[File / Object Storage]
    Ops[Monitoring, Logs and Operations]

    Actors --> Browser
    Browser -->|HTTPS / JSON API| API
    API --> DB
    API --> Providers
    API --> Files
    API --> Ops
```

This is a logical view. Replace or refine components to match verified
deployment and integration details.

### 3.2 Verified technology baseline

| Concern | Current implementation | Status |
| --- | --- | --- |
| Frontend | React 18.3, TypeScript 5.6 (strict), Vite 5.4, Tailwind CSS 4.2, TanStack Query 5, React Router 6, framer-motion, lucide-react | Implemented |
| Backend | Python 3.11+, FastAPI, Pydantic, SQLAlchemy, Alembic; one gateway process | Implemented |
| Database | SQLite for local development/tests; PostgreSQL target for deployment; migrations in `alembic/` | Implemented locally; production unverified |
| Containers | `Dockerfile.backend`, `Dockerfile.frontend`, `docker-compose.yml`, `Caddyfile` | Present; runtime/deployment unverified |
| Hosting config | `render.yaml`, `railway.toml`, `netlify.toml`, GitHub Pages workflow | Present; live state unverified |
| Identity | JWT access/refresh cookies, refresh rotation, hashed verification/reset tokens, email verification, phone OTP, role applications, optional Supabase bridge | Implemented |
| Payments | M-Pesa, Airtel Money and Tigo Pesa adapters with webhook/poll handling; manual bank transfer and cash-on-delivery flows | Partially implemented --- provider production verification pending |
| Uploads | Images stored as base64 data URIs in database columns via `backend/shared/utils/uploads.py`; 2 MB raw limit | Implemented |
| AI assistant | Gemini first, OpenAI fallback, rule-based fallback when providers are unavailable | Implemented; external provider availability unverified |
| Automated verification | Backend pytest suite; frontend `tsc` + Vite production build | Implemented |

## 4. Backend architecture

The backend is a **modular monolith with explicit service packages**.
This is the current structure; do not create a parallel `backend/app/`
tree or reorganise modules without an approved ADR and a migration plan.

``` text
backend/
├── api/
│   ├── main.py                 # App factory, CORS, lifespan, router wiring
│   ├── schema.py               # Transitional schema safety net
│   ├── seed.py                 # Demo marketplace bootstrap
│   └── routers/                # Gateway-owned cross-cutting endpoints
├── services/
│   ├── identity/               # Auth, users, customers, Supabase bridge
│   ├── sellers/                # Seller accounts and seller order operations
│   ├── catalog/                # Products, providers, RFQs, image uploads
│   ├── orders/                 # Checkout, lifecycle, inventory runtime
│   ├── payments/               # Transactions, provider adapters, webhooks
│   ├── delivery/               # Logistics accounts and delivery execution
│   ├── notifications/          # In-app notifications and email delivery
│   ├── intelligence/           # Analytics, marketplace insights, AI assistant
│   └── disputes/               # Dispute workflow
├── shared/
│   ├── database.py             # Engine and session factory
│   ├── models.py               # SQLAlchemy models (single database today)
│   ├── schemas/                # Cross-service DTOs
│   └── utils/                  # Geo, text and upload helpers
└── scripts/                    # Operational scripts
alembic/                        # Database migrations
tests/                          # Backend integration/regression suite
```

### 4.1 Layer responsibilities

  -----------------------------------------------------------------------
  Layer                   Responsibility          Must not become
  ----------------------- ----------------------- -----------------------
  API/router              HTTP routing,           Place for complex
                          authentication          business workflows
                          dependencies,           
                          request/response        
                          mapping                 

  Application/service     Use-case orchestration  Unstructured collection
                          and transaction         of unrelated helpers
                          boundaries              

  Domain                  Business rules,         Coupled to HTTP or
                          entities, value         provider SDK details
                          objects, valid          
                          transitions             

  Repository/data access  Persistence queries and Place for authorization
                          mapping                 policy to be bypassed

  Infrastructure          Database, email,        Source of marketplace
                          payment, storage,       policy
                          external provider       
                          adapters                

  Core                    Configuration, security A dumping ground for
                          primitives, logging,    feature-specific code
                          shared dependencies     
  -----------------------------------------------------------------------

The exact degree of domain modelling should match project complexity. Do
not add abstraction layers that do not improve clarity or testability.

### 4.2 Module boundaries

Each module should own its use cases, schemas, persistence access, and
tests where practical. Cross-module interactions should use explicit
service interfaces or well-defined application-level calls.

Avoid circular imports and direct access to another module's internal
tables when a stable interface is available.

## 5. Frontend architecture

The frontend is a feature-oriented React SPA. Keep the existing stack and
structure unless an evidence-based decision approves a change. New work
belongs in the existing `pages/`, `features/`, or `components/ui/`
directories --- do not introduce a second router, state library, styling
system, or API client.

``` text
frontend/
└── src/
    ├── app/
    │   └── App.tsx             # Route composition and role gates
    ├── components/
    │   ├── ui/                 # Button, Field, Badge, ProductCard,
    │   │                       # ImageUploader, PageSections, Modal
    │   ├── AuthScene.tsx
    │   ├── BrandMark.tsx
    │   └── Sidebar.tsx
    ├── features/
    │   ├── auth/               # Auth, Cart, Theme, route guards
    │   ├── cart/               # Cart sidebar
    │   ├── layout/             # App shell
    │   └── logistics/          # Tracking, chat, live map
    ├── lib/                    # http client, formatting, shared helpers
    ├── pages/                  # Route-level screens
    ├── config/                 # Runtime configuration (`env.apiBase`)
    ├── types/                  # Shared TypeScript contracts
    ├── assets/                 # Approved brand assets
    ├── styles/global.css       # Tailwind import, tokens, shared classes
    └── main.tsx                # Global providers + cart sidebar
```

Current frontend rules:

- All API calls go through `frontend/src/lib/http.ts`; do not call
  `fetch` directly from a page.
- Only public values belong in `VITE_*` variables. Never put secrets in
  the frontend bundle.
- Reuse `components/ui/*` and the shared classes in `styles/global.css`
  before creating a new component or adding page-specific CSS.
- Keep light and dark themes (`data-theme`) working; the `dark:` variant
  is configured in `global.css`.
- Frontend route guards improve usability but are **not** security
  controls. Backend authorization remains authoritative.
- Preserve the current public route paths in `app/App.tsx` unless a
  deliberate migration is approved.

## 6. Data architecture

### 6.1 Persistence principles

-   Use PostgreSQL as the production relational database if confirmed by
    current configuration.
-   Model relationships explicitly with foreign keys.
-   Use database constraints for uniqueness and referential integrity.
-   Add indexes based on query patterns and measured performance.
-   Use migrations as the authoritative schema evolution mechanism.
-   Avoid ad-hoc production schema changes at application startup.
-   Use transactions for workflows that must succeed or fail together.
-   Store monetary values using fixed-precision decimal types or integer
    minor units; never binary floating point.

### 6.2 Core domain concepts

Potential domain entities, subject to schema verification: - User and
role/permission assignments. - Seller/business profile. - Product and
category. - Inventory/stock movement. - Cart and cart item. - Order and
order item. - Payment and payment event. - Refund. - Delivery/shipment
and assignment. - RFQ and quotation. - Review. - Dispute. -
Notification. - Audit event.

Do not create duplicate entities merely to match this list. Confirm the
current model and relationships first.

### 6.3 Conceptual relationship view

``` mermaid
erDiagram
    USER ||--o| SELLER_PROFILE : may_have
    SELLER_PROFILE ||--o{ PRODUCT : lists
    PRODUCT ||--o{ INVENTORY_RECORD : tracks
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : referenced_by
    ORDER ||--o{ PAYMENT : has
    PAYMENT ||--o{ PAYMENT_EVENT : records
    ORDER ||--o{ DELIVERY : may_require
```

This diagram is conceptual only. Validate cardinality and actual table
names against the ORM models and migrations before using it as a schema
reference.

## 7. API architecture

The current API is **unversioned at the path level**: routers expose
stable root-level prefixes such as `/auth`, `/products`, `/business`,
`/orders`, `/payments`, `/logistics`, `/notifications`, `/disputes`,
`/ai`, and `/dashboard`. Do not introduce `/api/v1` aliases or rename
these paths without a frontend migration and compatibility window.

Current contract rules:

- The gateway (`backend/api/main.py`) mounts routers; feature endpoints
  belong in the owning service package.
- Management/catalogue endpoints deliberately differ:
  `GET /products/` is authenticated and returns the seller/admin
  management view (sellers see only their own products, including
  inactive items); `/products/marketplace` and `/products/public` hide
  inactive products.
- Collection endpoints generally return `{items, total, limit, offset}`
  where pagination applies. Keep that shape when extending them.
- Validate input with Pydantic schemas. Return consistent HTTP status
  codes and `detail` error messages without internal stack details.
- Authenticate protected routes and authorise every resource operation.
  Enforce ownership in the service/query layer, not only in the UI.
- Rate-limit sensitive endpoints (login, registration, verification,
  password recovery, payment initiation).
- Document contract changes here and in
  `docs/architecture/service-boundaries.md` in the same pull request.
- Never expose passwords, tokens, provider secrets, or internal
  exception details in responses or logs.

## 8. Identity and security architecture

Security controls must be verified in code and tests.

Required engineering expectations: - Use a dedicated password-hashing
scheme suitable for password storage. - Keep signing secrets and
provider credentials outside source control. - Use short-lived access
tokens and a deliberate refresh-token/session lifecycle. - Rotate and
revoke refresh credentials where supported. - Validate account
verification and status before granting protected access. - Enforce role
permissions and resource ownership on every relevant backend
operation. - Use least privilege and deny by default. - Apply rate
limiting and safe authentication error messages. - Protect against
injection, XSS, CSRF where applicable to the chosen authentication
model, and insecure file uploads. - Configure CORS for explicit trusted
origins. - Redact credentials, tokens, and sensitive personal/payment
data from logs. - Maintain security and administrative audit records.

Do not infer security quality from the presence of a JWT library or a
role field alone.

## 9. Payment architecture

Payment processing should be an isolated backend domain with provider
adapters. The business layer must not depend directly on a provider SDK.

Conceptual flow:

``` mermaid
sequenceDiagram
    participant C as Customer
    participant F as Frontend
    participant O as Order Service
    participant P as Payment Service
    participant G as Payment Provider
    participant D as Database

    C->>F: Confirm checkout
    F->>O: Submit order request
    O->>D: Validate and create pending order
    O->>P: Request payment
    P->>G: Initiate provider transaction
    G-->>P: Pending / initiation response
    P->>D: Record payment attempt
    G->>P: Authenticated provider event
    P->>P: Verify and process idempotently
    P->>D: Persist authoritative payment state
    F->>O: Retrieve order/payment status
    O-->>F: Current confirmed status
```

This is a target pattern, not proof that all steps currently exist.

### 9.1 Payment requirements

-   Keep order status separate from payment status.
-   Use unique internal and provider transaction references.
-   Verify callback authenticity (signature or provider-specific
    verification).
-   Make callbacks idempotent with database-enforced uniqueness where
    appropriate.
-   Never trust a browser redirect as proof of payment.
-   Do not allow a late failure event to overwrite an already confirmed
    success without a defined reconciliation process.
-   Enforce refund eligibility and maximum refundable amount.
-   Preserve immutable or append-only financial event history.
-   Reconcile provider transactions with internal records.
-   Handle timeouts and uncertain provider responses safely.

### 9.2 Current provider status register

| Method | Current status | Notes |
| --- | --- | --- |
| M-Pesa | Partial | Adapter + webhook + polling fallback implemented; sandbox/production credentials, endpoint paths, callback authentication, and settlement are not verified in this repository. |
| Airtel Money | Partial | Adapter + webhook + polling fallback implemented; production account, payload/version compatibility, callback authentication, and settlement are unverified. |
| Tigo Pesa | Partial / requires aggregator work | Generic adapter exists; the current request/response shape is not a specific aggregator contract. Treat production integration as planned. |
| Bank transfer | Implemented (manual) | Customer initiates; authorised staff confirm the transaction through the admin confirmation endpoint. |
| Cash on delivery | Implemented (manual) | Payment state is confirmed on delivery through the existing manual flow. |
| Credit account | Planned / disabled | Listed as disabled in `PAYMENT_METHODS`; do not enable without an approved policy. |
| Refunds | Planned | No refund service is implemented. Dispute records may mention a refund outcome, but that is not an automated financial transaction. |

Do not describe a method as fully integrated until the end-to-end
provider flow, callback authenticity, and reconciliation have been
verified in the target environment.

## 10. Environment and configuration

### Backend

-   Keep the local backend `.env` in the backend application root if
    that is how the settings loader is configured.
-   Commit `.env.example` with variable names and safe placeholders
    only.
-   Exclude real `.env` files and secrets from version control.
-   Load settings centrally using validated typed configuration.
-   Separate development, test, staging, and production settings.
-   Inject production secrets through the hosting platform or secret
    manager.

### Frontend

-   Keep only public configuration in frontend environment variables.
-   For Vite, variables prefixed with `VITE_` are exposed to browser
    code.
-   Use a single central frontend configuration module.
-   Never place database credentials, SMTP passwords, JWT signing keys,
    or private payment credentials in frontend variables.

### Example public frontend configuration

``` env
VITE_API_BASE_URL=https://api.example.com
VITE_APP_NAME=Soko-Link
```

The URL above is illustrative. Use the actual configured deployment URL;
do not commit secrets or assume the example domain exists.

## 11. External integrations

Wrap external services behind interfaces/adapters: - Email delivery. -
SMS/phone verification if enabled. - Payment providers. - File/object
storage. - Maps/geolocation if actually implemented. - AI providers. -
Background jobs or messaging.

Use timeouts, bounded retries, idempotency, and clear failure handling.
Do not retry non-idempotent financial operations blindly.

For production uploads, verify that storage is durable and shared across
application instances. A container or ephemeral service filesystem
should not be assumed to provide durable storage.

## 12. Deployment and operations

Document and verify the actual deployment topology.

Production requirements: - HTTPS and secure reverse-proxy
configuration. - Explicit CORS origins. - Health and readiness checks. -
Database backups and tested restore procedures. - Migration execution as
a controlled release step. - Centralised logs and error monitoring. -
Resource and availability monitoring. - Secret rotation procedure. -
Rollback strategy. - Incident ownership and support process.

A Dockerfile, Compose file, or hosting manifest does not prove that the
deployed service is healthy.

## 13. Testing strategy

### Backend

-   Unit tests for domain rules and services.
-   Integration tests for database operations and transactions.
-   API tests for validation, authorization, and error handling.
-   Security tests for role escalation and resource ownership.
-   Payment tests for callback verification, idempotency, duplicate
    events, timeouts, and refunds.

### Frontend

The repository does **not** currently configure a frontend unit,
component, or end-to-end test runner. Contributors must therefore verify
frontend changes with:

-   `tsc --noEmit -p tsconfig.app.json` (type safety).
-   `npm run build` (production build).
-   Manual checks of the affected flow at narrow, medium, and wide
    viewports, in both light and dark themes.
-   Manual loading, empty, success, and error states for any new async
    screen.

If a frontend test runner is added, update this section, `package.json`,
CI, and `CONTRIBUTING.md` in the same pull request.

### Critical invariants

-   A user cannot access another user's restricted resource.
-   A seller cannot modify another seller's listing.
-   Checkout cannot oversell stock.
-   Client-side totals cannot override server calculations.
-   Duplicate payment events cannot duplicate financial effects.
-   An unverified payment cannot be shown as successful.
-   Refunds cannot exceed eligible paid value.

## 14. Observability and audit

Use structured logs with correlation/request IDs where practical.
Capture application errors, latency, failed jobs, provider failures, and
critical business events.

Audit consequential actions such as: - Role and account changes. -
Seller approvals. - Product moderation. - Order state changes. - Payment
and refund state changes. - Dispute decisions. - Administrative
configuration changes.

Do not log passwords, access tokens, private keys, full payment
credentials, or unnecessary personal information.

## 15. Architecture decision records

Store significant technical decisions in `docs/adr/` using a consistent
format.

Suggested template:

``` markdown
# ADR-NNN: Decision title

- Status: Proposed | Accepted | Superseded
- Date:
- Decision owners:

## Context
What problem or constraint requires a decision?

## Decision
What was selected?

## Alternatives considered
What other options were evaluated?

## Consequences
What improves, what becomes harder, and what must be maintained?

## Security and operational impact
What changes for security, reliability, cost, or operations?
```

## 16. Current gaps and verification checklist

Verified in this baseline:

- [x] Frontend and backend directory structures confirmed.
- [x] Runtime dependency versions confirmed from manifests.
- [x] Database and migration configuration confirmed (SQLite dev/test,
      PostgreSQL production target, Alembic).
- [x] Public API prefixes and frontend route map confirmed.
- [x] Authentication, refresh-token rotation, email verification, phone
      OTP, and role-application flows located in source.
- [x] Payment methods and their implementation status inventoried.
- [x] Image upload path and size/type rules confirmed.
- [x] Backend regression test suite and frontend build commands confirmed.

Still open and requiring environment or owner verification:

- [ ] Role and resource-ownership enforcement reviewed against every
      service endpoint (tests exist, but a fresh security review is
      outstanding).
- [ ] Mobile-money callback authentication and idempotency verified
      against each live provider.
- [ ] Inventory concurrency behaviour verified under real concurrent
      checkout load.
- [ ] File-storage durability confirmed for the target deployment
      (current implementation stores base64 data in database columns).
- [ ] Production deployment, CORS, environment, backups, monitoring,
      and rollback verified in the hosting account.
- [ ] Database diagrams generated from the actual models/migrations.
- [ ] API documentation and critical tests linked from the deployed
      environment.

## 17. Maintenance

Update this document when a module boundary, API contract, database
design, security control, provider integration, deployment topology, or
major technical decision changes.

Architecture changes should be reviewed for their impact on `Design.md`,
`PRD-Statement.md`, business rules, tests, and operational
documentation. Significant decisions belong in `docs/adr/` using the
template above.

Contributor workflow, branch rules, verification commands, and review
expectations live in [CONTRIBUTING.md](CONTRIBUTING.md).
