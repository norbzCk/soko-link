# SokoLink

SokoLink is a multi-role marketplace and fulfilment platform: customers browse
and order products, sellers manage inventory and fulfilment, logistics partners
deliver, and superadmins operate the marketplace.

The repository is a **microservice-ready modular monorepo**: one FastAPI gateway
today, with separate service packages for each business capability.

## Project baselines

Contributors must start from the current implementation, not rebuild it:

- [Architecture.md](Architecture.md) — verified system structure, service
  ownership, API contracts, and integration status.
- [PRD-Statement.md](PRD-Statement.md) — product scope, current capability
  baseline, business rules, and change control.
- [Design.md](Design.md) — approved design tokens, shared components, and
  design quality gates.
- [CONTRIBUTING.md](CONTRIBUTING.md) — required workflow, verification
  commands, and review checklist.
- [docs/seller-workspace.md](docs/seller-workspace.md) — seller API, isolation
  rules, catalogue, finance and security behaviour.
- [docs/rbac-permissions.md](docs/rbac-permissions.md) — role matrix,
  verification and moderation permissions.

See [docs/architecture/overview.md](docs/architecture/overview.md) for the
detailed repository and request-flow documentation.

## Repository layout

```text
backend/
├── api/          # FastAPI gateway: app wiring, CORS, health, superadmin
├── services/     # identity, sellers, catalog, orders, payments,
│                 # delivery, notifications, intelligence, disputes
├── shared/       # database, models, shared schemas, utilities
└── scripts/      # operational scripts
frontend/         # React + TypeScript + Vite application
tests/            # backend regression and integration tests
alembic/          # database migrations
docs/             # architecture and operations documentation
```

See [docs/architecture/overview.md](docs/architecture/overview.md) and
[docs/architecture/service-boundaries.md](docs/architecture/service-boundaries.md)
for the full architecture.

## Tech stack

- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic, Alembic, PostgreSQL
- **Frontend:** React, TypeScript, Vite, Tailwind, TanStack Query
- **Payments:** M-Pesa, Airtel Money, Tigo Pesa, bank transfer, cash
- **Auth:** Unified identity IAM with JWT access/refresh rotation, email verification, phone OTP verification, role applications, and optional Supabase bridge

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
cd frontend && npm install && cd ..
cp .env.example .env
```

### Run the backend

```bash
DATABASE_URL=sqlite:///./dev.db .venv/bin/uvicorn backend.api.main:app --reload --port 8000
```

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/healthz`

First startup seeds demo marketplace data.

### Run the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. The local frontend defaults to the API at
`http://localhost:8000`.

## Tests

```bash
make test
```

Or directly:

```bash
DATABASE_URL=sqlite:///./test.db .venv/bin/python -m pytest -q
```

The suite covers auth, products, orders, payments, delivery, notifications,
analytics, disputes and AI assistant behavior.

## Identity and access management

SokoLink uses one canonical `Identity` per person with linked customer, seller,
and logistics profiles. Public registration creates the identity and customer
profile but does **not** issue a session until the email address is verified.
Seller and logistics registration also requires administrator approval of the
role application before that workspace can be used.

- Supported roles: `CUSTOMER`, `SELLER`, `LOGISTICS_PROVIDER`,
  `ADMINISTRATOR`, `ANALYST`.
- Account statuses: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DISABLED`.
- Role applications: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`.
- Customers can apply for additional roles from **Roles & Access** in the app.
- Administrators review applications in the **IAM Console**.
- `GET /auth/me` and role switching are identity-aware; access tokens encode the
  active role but authorization checks the current account and role status.
- Email verification and password-reset tokens are stored hashed. Refresh tokens
  rotate and are revoked on password changes and account suspension.

Set `FRONTEND_URL` so verification and reset links point at the deployed frontend.
Configure `SMTP_HOST`, `SMTP_FROM_EMAIL`, and related SMTP variables to deliver
those links. If SMTP is not configured, development logs email verification,
password-reset links, and phone OTPs; production never treats logging as delivery. There is no bundled
SMS gateway yet — phone OTP notifications use the account email channel when
SMTP is configured and otherwise require an external SMS integration.

## Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

## Environment variables

Copy `.env.example` and set at least:

- `DATABASE_URL` — database connection string
- `APP_SECRET_KEY` — long random secret used to sign JWTs
- `CORS_ORIGINS` — comma-separated allowed frontend origins
- `FRONTEND_URL` — public frontend URL used in verification/reset links
- `APP_ENV` — `development` or `production`
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`, `INITIAL_SELLER_*`, and `INITIAL_CUSTOMER_*` — operator-supplied initial-account settings
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
  `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_USE_TLS` — email delivery
- `VITE_API_BASE` — frontend API base URL

Payment provider variables are documented in `.env.payments.example`.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/architecture/development.md](docs/architecture/development.md) before
opening a pull request.

Key rules:

- Extend the current baseline; do not re-platform, reorganise, or redesign
  working modules.
- Add feature endpoints to the owning service under `backend/services/`.
- Keep `backend/api/main.py` limited to app wiring and gateway endpoints.
- Keep public API paths stable during refactors.
- Reuse the shared UI primitives and design tokens in `frontend/`.
- Add regression tests for business-rule changes.
- Never commit `.env`, credentials or generated databases.
