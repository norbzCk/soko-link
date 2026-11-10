# Local PostgreSQL and initial accounts

Local development uses PostgreSQL 16 in Docker Compose. Production database
configuration remains deployment specific; do not reuse this local Compose
configuration for production.

## First setup

1. Copy `.env.example` to `.env` if you do not already have a local `.env`.
   Generate local secrets with `openssl rand -hex 32` and set `DB_PASSWORD`
   and `APP_SECRET_KEY`. Keep `.env` private and out of version control.
2. Remove any old `DATABASE_URL=sqlite:...` entry from `.env`. If you use
   `DATABASE_URL`, it takes precedence over the `DB_*` settings and must point
   at the local PostgreSQL database.
3. Set the three account emails and passwords in `.env`. Set
   `INITIAL_SELLER_PHONE`, `INITIAL_SELLER_BUSINESS_NAME`, and
   `INITIAL_SELLER_NAME` too. Each password must be at least 12 characters
   and include uppercase, lowercase, a digit, and a symbol. Bootstrap does not
   print or return passwords.
4. Before first start, inspect for an existing container or volume with these
   exact names: `docker ps -a --filter name=sokolink-postgres` and
   `docker volume inspect sokolink_postgres_data`. If the volume exists and
   you cannot confirm it belongs to this SokoLink development database, stop
   and do not attach or remove it. Compose does not delete existing volumes.

The host port defaults to `5432` and is controlled by `DB_PORT`. If another
local database already uses that port, set `DB_PORT=5433` (or another free
port) in `.env`. Host-run Alembic and bootstrap commands use this port; the
backend container continues to connect to PostgreSQL on port `5432` inside the
Compose network.

The operator must verify control of each supplied email address out of band;
the trusted local bootstrap policy then records those email addresses as
verified and approves the initial seller role. The seller's business
verification remains pending for the normal review workflow. The bootstrap
does not mark the seller's phone as verified. This exception applies only to
the explicit operator-run command; public customer registration and seller
onboarding keep their normal verification and approval requirements.

## Database commands

```bash
podman compose up -d db                 # start PostgreSQL
podman compose stop db                  # stop it
podman compose restart db               # restart it
podman compose logs -f db               # inspect logs
podman compose exec db pg_isready -U sokolink_user -d sokolink_db
podman compose exec db psql -U sokolink_user -d sokolink_db
alembic upgrade head                    # apply migrations from the host
podman compose up --build -d            # start the full local stack
```

The backend container also runs `alembic upgrade head` before starting the
API. API startup itself does not create tables or insert marketplace data.
`python -m backend.scripts.init_db` remains as a compatibility command and
only applies Alembic migrations.

## Bootstrap and verify accounts

Run after migrations, with the bootstrap settings present in `.env`:

```bash
python -m backend.scripts.bootstrap_users
podman compose exec db psql -U sokolink_user -d sokolink_db -c \
  "SELECT i.email, r.role FROM identities i JOIN identity_roles r ON r.identity_id=i.id ORDER BY i.email, r.role"
```

The command is idempotent. Existing complete accounts are left as they are;
it does not reset passwords. An account with the configured email but an
incomplete profile or wrong role causes the transaction to fail for manual
review. The initial roles are `SUPER_ADMIN`, `SELLER`, and `CUSTOMER` with
their corresponding user or seller profiles. No products, orders, fake users,
or sample sellers are created.

## Backup and restore

Create a compressed local backup:

```bash
mkdir -p backups
podman compose exec -T db pg_dump -U sokolink_user -d sokolink_db -Fc > backups/sokolink_db.dump
```

Restore only into the intended local SokoLink database. This replaces objects
in that database:

```bash
podman compose exec -T db pg_restore --clean --if-exists -U sokolink_user -d sokolink_db < backups/sokolink_db.dump
```

The named volume is `sokolink_postgres_data`. `podman compose down` keeps it;
do not use `down -v` for a reset. For a deliberately clean local start, first
inspect and back up the target database, stop this project, and remove only
the SokoLink volume after confirming its exact name. Never remove volumes by
wildcard or as part of routine setup.

## Production

Production must use a separately provisioned PostgreSQL service, secret store,
network policy, and backup/restore process. Set `DATABASE_URL` or the `DB_*`
variables through the deployment secret manager. Do not publish the local
Compose ports or copy development credentials into production.
