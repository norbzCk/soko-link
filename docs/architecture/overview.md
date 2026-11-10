# SokoLink Architecture

> **Start here for contribution rules:** [Architecture.md](../../Architecture.md)
> is the current verified baseline and [CONTRIBUTING.md](../../CONTRIBUTING.md)
> defines the required workflow. This page provides the detailed repository and
> request-flow view.

SokoLink is a **microservice-ready modular monorepo**. The backend currently
ships as one FastAPI gateway, but every business capability lives in its own
service package with an explicit router boundary. This keeps local development
and testing simple while making later extraction into independent deployables a
packaging exercise rather than a rewrite.

## Repository layout

```text
soko-link/
├── backend/
│   ├── api/                  # FastAPI gateway / composition root
│   │   ├── main.py           # App factory, CORS, lifespan, router wiring
│   │   ├── schema.py         # Legacy helper; not called at startup
│   │   └── routers/          # Gateway-owned cross-cutting endpoints
│   ├── services/             # Business capabilities
│   │   ├── identity/         # Auth, users, customers, Supabase bridging
│   │   ├── sellers/          # Seller accounts and seller order operations
│   │   ├── catalog/          # Products, providers, RFQs
│   │   ├── orders/           # Checkout, order lifecycle, inventory runtime
│   │   ├── payments/         # Payment transactions and provider adapters
│   │   ├── delivery/         # Logistics accounts and delivery execution
│   │   ├── notifications/    # In-app notifications and email delivery
│   │   ├── intelligence/     # Analytics, marketplace insights, AI assistant
│   │   └── disputes/         # Dispute workflow
│   ├── shared/               # Explicitly shared kernel
│   │   ├── database.py       # Engine and session factory
│   │   ├── models.py         # SQLAlchemy models (single database today)
│   │   ├── schemas/          # Cross-service DTOs
│   │   └── utils/            # Geo, text and upload helpers
│   └── scripts/              # Operational scripts
├── frontend/                 # React + TypeScript + Vite application
│   └── src/
│       ├── app/              # App composition and routing
│       ├── components/       # Reusable presentation components
│       ├── features/         # Feature modules (auth, cart, logistics, layout)
│       ├── lib/              # HTTP and infrastructure adapters
│       ├── pages/            # Route-level screens
│       ├── config/           # Runtime configuration
│       └── types/            # Shared TypeScript domain types
├── tests/                    # Backend integration/regression suite
├── alembic/                  # Database migrations
└── docs/                     # Architecture and operations documentation
```

## Request flow

```text
Browser / mobile client
        │
        ▼
React SPA (frontend/)
        │  HTTPS + JWT/cookies
        ▼
FastAPI gateway (backend/api)
        │  in-process calls today
        ├── identity service
        ├── catalog service
        ├── orders service
        ├── payments service
        ├── delivery service
        ├── notifications service
        ├── intelligence service
        └── disputes service
        │
        ▼
PostgreSQL (single database today)
```

## Principles

1. **One capability, one service package.** Routes, domain rules and service
   helpers for a capability belong together.
2. **The gateway owns transport concerns.** CORS, static files, health checks
   and cross-cutting dashboard/admin endpoints are wired in `backend/api`.
3. **The shared kernel is intentionally small.** `backend/shared` contains only
   infrastructure and models that are genuinely shared today.
4. **No service may import the gateway.** Dependencies point inward:
   `api -> services -> shared`.
5. **Keep the public API stable during restructuring.** Frontend paths and
   response contracts must not change unless a migration is deliberate.
6. **Every move is verified by tests.** The regression suite is the safety net
   for structural changes.

API startup does not create or patch schema and does not seed demo data. Apply
production schema changes with reviewed Alembic migrations. The old demo seed
module has been removed.

## Current deployment model

- One backend process: `uvicorn backend.api.main:app`
- One frontend build: `frontend/dist`
- One PostgreSQL database

This is intentional. The architecture review recommends a modular monolith
first; premature database-per-service splits add operational cost before the
domain boundaries are stable.

## Future extraction path

When a service needs independent scaling or ownership:

1. Move its routes into a standalone FastAPI app under the same package.
2. Give it a dedicated database schema or database.
3. Replace in-process calls with authenticated HTTP or an event bus.
4. Register the service behind the gateway or a reverse proxy.
5. Move its tables with an Alembic migration and a backfill plan.

The highest-value extraction candidates are **payments** and **notifications**
because they already have asynchronous/external-provider concerns.

See [service-boundaries.md](service-boundaries.md) for ownership and endpoints.
