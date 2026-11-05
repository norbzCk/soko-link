# Local Development

See [architecture/development.md](architecture/development.md) for the canonical
setup and workflow.

## Ports

| Service | URL |
| --- | --- |
| Frontend (Vite) | `http://localhost:5173` |
| Frontend (Docker) | `http://localhost:8080` |
| Backend gateway | `http://localhost:8000` |
| PostgreSQL (Docker) | `localhost:5432` |

## Common commands

```bash
make backend    # FastAPI gateway with reload
make frontend   # Vite dev server
make test       # backend regression suite
make check      # Python compile check
make up         # Docker Compose stack
```

## CORS and cookies

- `CORS_ORIGINS` must include the browser origin using the API.
- Do not use `*` when credentials are enabled.
- For cross-site cookies over HTTPS, use `SameSite=None; Secure`.

## Troubleshooting

- **Database errors:** force SQLite with
  `DATABASE_URL=sqlite:///./dev.db` or start PostgreSQL with `make up`.
- **Frontend cannot reach API:** check `VITE_API_BASE` and `CORS_ORIGINS`.
- **Schema mismatch:** the startup bootstrap patches known legacy columns;
  future schema changes should be Alembic migrations.
