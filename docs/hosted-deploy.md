# Hosted deployment baseline

## Primary host: Render

`render.yaml` is the only complete deployment blueprint in this repository: it
defines the static frontend, FastAPI backend, and managed PostgreSQL database.
Treat Render as the intended primary host. This describes repository
configuration; it does not verify that the services are deployed, healthy, or
using the current blueprint.

The frontend build gets its API origin from `VITE_API_BASE`, set in
`render.yaml` to `https://sales-backend.onrender.com`. The backend allows the
matching static site origin, `https://sokolink-frontend.onrender.com`, through
`CORS_ORIGINS`; `FRONTEND_URL` is also set to that origin. If either Render
service is renamed or assigned a custom domain, update both values and the
frontend's `VITE_API_BASE` together. Do not add a trailing slash requirement;
the frontend normalizes it.

### Required Render configuration

The Blueprint provisions `DATABASE_URL` from its managed PostgreSQL database
and generates `APP_SECRET_KEY`. Configure or verify these values in the Render
dashboard before production traffic:

- `APP_ENV=production`.
- `DATABASE_URL` must point to the intended persistent managed PostgreSQL
  database. Back it up before any migration.
- `APP_SECRET_KEY` must remain stable across deploys and be treated as a secret.
- `CORS_ORIGINS` must contain only the exact browser origins in use; keep
  `FRONTEND_URL` synchronized.
- `SUPABASE_URL` and `SUPABASE_JWKS_URL` are configured by the Blueprint.
  `SUPABASE_DATABASE_URL` is optional and should only be set if the application
  integration requires it.
- Configure `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and
  `SMTP_FROM_EMAIL` in Render if verification and notification email delivery
  is required. Do not put secret values in this repository.
- Configure payment-provider credentials and webhook URLs only after the
  respective provider integration is validated for production. The repository
  does not prove that live payment processing is ready.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public frontend
  configuration, not service-role secrets. Never put a Supabase service key in
  a `VITE_*` variable.

The API startup does not create tables, seed demo records, or patch schema.
Production schema changes must be applied with Alembic after a reviewed backup
and migration plan. Before the first production upgrade:

1. Identify the exact Render database and take a restorable backup. Record the
   current Alembic revision (or confirm that the database has no version table)
   and inventory the live tables and columns.
2. Compare the live schema with the baseline migration and each pending
   revision. The baseline (`20260428_01`) creates model tables from metadata
   inside Alembic; do not treat it as a harmless no-op on an existing database.
3. Review data effects and revise/replace a migration if needed. In particular,
   `43811e82f398` drops legacy columns from `sales` when present. Preserve any
   required values before dropping those columns.
4. Restore the backup to a staging database, rehearse the exact upgrade path,
   validate application reads/writes and row counts, then schedule production
   application with an explicit rollback/restore plan.

Do not configure an automatic deploy-time migration until this review is
complete. No production database was inspected or changed as part of this work;
therefore its Alembic version, schema compatibility, and backup restorability
remain unknown.

## GitHub Pages

The GitHub Pages deploy workflow has been removed because Render is the selected
primary host. If Pages is enabled in repository settings, disable it there or
change its source to avoid publishing stale builds. This repository change
cannot alter GitHub repository settings.

`railway.toml` and `netlify.toml` remain secondary configuration artifacts;
they are not the selected deployment target and their live configuration is
unverified. The frontend uses an explicit `VITE_API_BASE` override for custom
domains or alternate hosts.

## Deployment verification

After configuring and deploying services, check the API and browser behavior:

```bash
curl -i https://sales-backend.onrender.com/healthz
```

Expect HTTP 200 and a healthy database status. From the deployed frontend,
inspect a browser API request and verify the response has an
`Access-Control-Allow-Origin` matching the frontend origin. Cookie-based
requests also require credentials to be allowed and secure cookie settings
appropriate for HTTPS. Confirm database backups and restore procedures through
the Render database controls before accepting production data.

The live service URLs, Render environment values, CORS response, database
health, backup policy, and Pages repository setting remain unverified until an
operator checks the deployed project.
