# API Gateway

`backend/api` is the composition root for the backend.

- `main.py` creates the FastAPI app, configures CORS/rate limiting, mounts static
  uploads and includes service routers.
- `routers/` contains gateway-owned endpoints: health, marketplace trends,
  superadmin operations, analytics and frontend serving.
- `main.py` does not create or patch database schema and does not seed demo
  records. Apply schema changes explicitly with Alembic.
- `schema.py` is a legacy compatibility helper retained for tests; do not call
  it from production startup. The former demo seeder was removed.

Run the gateway with:

```bash
uvicorn backend.api.main:app --reload --port 8000
```
