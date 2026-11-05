# Contributing to SokoLink

## Branching

- `main` is always deployable.
- Use short-lived branches: `feat/<scope>`, `fix/<scope>`, `refactor/<scope>`,
  `docs/<scope>`.
- Keep pull requests focused on one capability or concern.

## Before opening a pull request

```bash
make check
make test
```

If you touched the frontend, run:

```bash
cd frontend
npm run build
```

## Review expectations

- Public API behavior must remain backward compatible unless the pull request
  explains the migration.
- New business rules need regression tests.
- Keep service boundaries intact; do not add feature routes to
  `backend/api/main.py`.
- Update architecture docs when adding a service, moving ownership, or changing
  a cross-service contract.

## Commit messages

Use a concise imperative subject, for example:

```text
Refactor delivery creation to require settled payments
Add payment IDOR regression tests
Move frontend source to frontend/
```

## Secrets

Never commit `.env`, credentials, private keys or production connection strings.
Use `.env.example` for documented placeholders.
