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
podman compose up -d db
alembic upgrade head
podman compose up --build -d
```

See [PostgreSQL and initial accounts](postgresql-development.md) for the
environment settings, account bootstrap, backup, and restore commands.

## CORS and cookies

- `CORS_ORIGINS` must include the browser origin using the API.
- Do not use `*` when credentials are enabled.
- For cross-site cookies over HTTPS, use `SameSite=None; Secure`.

## Troubleshooting

- **Database errors:** start the local database with `podman compose up -d db`
  and check `podman compose logs db`.
- **Frontend cannot reach API:** check `VITE_API_BASE` and `CORS_ORIGINS`.
- **Schema mismatch:** apply schema changes with `alembic upgrade head` and
  manage future changes through Alembic migrations.
