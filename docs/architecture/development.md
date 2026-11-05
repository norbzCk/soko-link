# Development Workflow

## Prerequisites

- Python 3.11+
- Node.js 20+ and npm
- PostgreSQL 15 (or SQLite for local tests)

## First-time setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
cd frontend && npm install && cd ..
cp .env.example .env
```

## Run the backend

```bash
DATABASE_URL=sqlite:///./dev.db .venv/bin/uvicorn backend.api.main:app --reload --port 8000
```

The first startup seeds demo marketplace data. API docs are at
`http://localhost:8000/docs`.

## Run the frontend

```bash
cd frontend
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend defaults to
`http://localhost:8000` for API calls in local development.

## Tests

```bash
DATABASE_URL=sqlite:///./test.db .venv/bin/python -m pytest -q
```

Target a single capability while iterating, for example:

```bash
DATABASE_URL=sqlite:///./test.db .venv/bin/python -m pytest -q tests/test_payments.py
```

## Adding a backend capability

1. Create or choose a package under `backend/services/<capability>`.
2. Add the router and domain helpers inside that package.
3. Register the router in `backend/api/main.py`.
4. Add tests under `tests/`.
5. Update `docs/architecture/service-boundaries.md` if ownership changes.

## Code conventions

- Python: PEP 8, 4-space indentation, typed function signatures where practical.
- TypeScript: strict types, feature-local components, no direct `fetch` outside
  `src/lib/http.ts`.
- API paths remain stable during refactors.
- Do not add schema `ALTER TABLE` statements to `main.py`; use Alembic for new
  schema changes (the current bootstrap patch is transitional).
- No secrets in source control. Use `.env` locally and platform secrets in
  deployment.

## Commit and review checklist

- [ ] Tests pass (`make test`)
- [ ] Python compiles (`make check`)
- [ ] No unrelated files or generated databases included
- [ ] Public API changes documented
- [ ] Architecture doc updated when boundaries move
