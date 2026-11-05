# API Gateway

`backend/api` is the composition root for the backend.

- `main.py` creates the FastAPI app, configures CORS/rate limiting, mounts static
  uploads and includes service routers.
- `routers/` contains gateway-owned endpoints: health, marketplace trends,
  superadmin operations, analytics and frontend serving.
- `schema.py` is a transitional schema safety net. New schema changes belong in
  Alembic.
- `seed.py` inserts demo marketplace data on startup when the database is empty.

Run the gateway with:

```bash
uvicorn backend.api.main:app --reload --port 8000
```
