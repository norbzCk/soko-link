# SokoLink

SokoLink is a multi-role marketplace and fulfilment platform: customers browse
and order products, sellers manage inventory and fulfilment, logistics partners
deliver, and superadmins operate the marketplace.

The repository is a **microservice-ready modular monorepo**: one FastAPI gateway
today, with separate service packages for each business capability.

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
- **Auth:** JWT access/refresh tokens with optional Supabase bridge

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
- `VITE_API_BASE` — frontend API base URL

Payment provider variables are documented in `.env.payments.example`.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/architecture/development.md](docs/architecture/development.md) before
opening a pull request.

Key rules:

- Add feature endpoints to the owning service under `backend/services/`.
- Keep `backend/api/main.py` limited to app wiring and gateway endpoints.
- Keep public API paths stable during refactors.
- Add regression tests for business-rule changes.
- Never commit `.env`, credentials or generated databases.
