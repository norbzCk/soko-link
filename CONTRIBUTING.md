# Contributing to Soko-Link

This project is an existing, working marketplace. Contributions must
**extend the current implementation**, not re-platform, reorganise, or
redesign it from scratch.

Read these before changing behaviour:

- [Architecture.md](Architecture.md) — verified system structure, service
  ownership, API contracts, payment status, and open verification items.
- [PRD-Statement.md](PRD-Statement.md) — product scope, current capability
  baseline, business rules, and change control.
- [Design.md](Design.md) — approved visual system, tokens, shared
  components, and design quality gates.

If any of these documents disagree with the code, treat the code and
tests as authoritative and fix the document in the same pull request.

## 1. Start from the current baseline

Before writing code:

1. **Locate the owning capability.** Backend endpoints belong to
   `backend/services/<capability>/`; frontend screens belong to
   `frontend/src/pages/` or an existing `features/` module.
2. **Read the current flow end to end.** Include the backend contract,
   frontend caller, role checks, loading/error states, and tests.
3. **Check the status.** If the capability is `Implemented`, you are
   changing working behaviour — preserve it unless the issue explicitly
   approves a change. If it is `Planned` or `Under consideration`, do not
   build it without product-owner approval and acceptance criteria.
4. **Choose the smallest change.** Extend existing modules, components,
   tokens, and API paths. Do not create parallel structures.
5. **Write or update the regression test first** for business-rule
   changes, or document the manual verification steps for UI-only work.
6. **Update the baseline documents** in the same pull request when a
   contract, status, token, or business rule changes.

## 2. Non-negotiable principles

- **Backend is authoritative.** Frontend checks improve usability; they
  are not security or pricing controls.
- **Preserve public contracts.** Do not rename API paths, remove fields,
  or change response shapes without a migration note and frontend
  compatibility update.
- **No fake data, dead controls, or invented success states.** Every
  visible action must work against a real API or be clearly disabled with
  a reason.
- **One capability per pull request.** Keep changes reviewable and
  reversible.
- **Security and money are high-risk.** Changes to auth, roles,
  ownership, payments, inventory, totals, or order state require tests
  and careful review.
- **No secrets in source.** Never commit `.env`, credentials, private
  keys, tokens, or generated databases.
- **Schema changes use Alembic.** Do not add ad-hoc `ALTER TABLE`
  statements to application startup.
- **No drive-by rewrites.** Do not reformat unrelated files, move
  directories, or replace working components in a feature PR.

## 3. Repository ownership

| Area | Location | Owns |
| --- | --- | --- |
| Gateway | `backend/api/` | App wiring, CORS, health, static frontend, cross-cutting admin endpoints |
| Services | `backend/services/` | Business capability routes and domain logic |
| Shared kernel | `backend/shared/` | Database, models, shared schemas, utilities |
| Migrations | `alembic/` | Schema evolution |
| Backend tests | `tests/` | Regression and integration coverage |
| Frontend app | `frontend/src/app/` | Route composition and role gates |
| Frontend pages | `frontend/src/pages/` | Route-level screens |
| Frontend features | `frontend/src/features/` | Auth, cart, theme, layout, logistics behaviour |
| UI primitives | `frontend/src/components/ui/` | Shared buttons, fields, badges, cards, uploaders, page sections |
| API client | `frontend/src/lib/http.ts` | All frontend HTTP calls |
| Design tokens | `frontend/src/styles/global.css` | Theme variables and shared component classes |

Dependency direction: `api → services → shared`. No service imports the
gateway. Cross-service calls use explicit public helpers.

See [docs/architecture/service-boundaries.md](docs/architecture/service-boundaries.md)
for endpoint ownership.

## 4. Backend rules

- Add feature endpoints to the owning service package and register the
  router in `backend/api/main.py` only.
- Keep `backend/api/main.py` limited to app wiring, CORS, health, static
  serving, and gateway-owned endpoints.
- Validate input with Pydantic schemas; return consistent HTTP status
  codes and safe `detail` messages.
- Enforce authentication, role permissions, and resource ownership in
  the backend service/query layer.
- Rate-limit sensitive endpoints (login, registration, verification,
  password recovery, payment initiation).
- For contact verification, issue short-lived, hashed, single-use OTPs
  with attempt and resend limits. Never return OTPs in responses or URLs,
  and never log them in production.
- Use transactions for multi-step financial, inventory, or order
  workflows. Preserve idempotency where duplicate requests are possible.
- Add schema changes through Alembic with an upgrade **and** downgrade
  path.
- Add or update tests under `tests/` for every business-rule change.

## 5. Frontend rules

- Use the existing React 18 + TypeScript + Vite + Tailwind 4 stack. Do
  not add a router, state library, styling system, or API client without
  an approved architecture decision.
- All API calls go through `frontend/src/lib/http.ts`. Do not call
  `fetch` directly from pages or components.
- Reuse `frontend/src/components/ui/*` and the shared classes in
  `frontend/src/styles/global.css` before creating new styles.
- Use tokens from `global.css`; do not hard-code new hex values.
- Support both `data-theme="light"` and `data-theme="dark"`.
- Handle loading, empty, error, and success states for every async flow.
- No dead buttons, fake links, placeholder toasts, or invented counts.
- Keep layouts responsive; verify narrow, medium, and wide viewports.
- Preserve public route paths in `frontend/src/app/App.tsx` unless a
  migration is approved.

## 6. Design rules

- The current design system is “Market Modern” with Sora/Inter,
  ocean-blue brand, saffron accent, warm paper neutrals, and shared
  radius/shadow tokens.
- Extend `components/ui/*` rather than creating one-off markup.
- Follow the quality gates in [Design.md](Design.md).
- New visual patterns require: a token in `global.css`, light/dark
  verification, responsive verification, and a documentation update.
- Do not submit page-wide redesigns as part of an unrelated feature.

## 7. Required verification

Run these before opening a pull request:

```bash
make check
make test
```

If you touched the frontend:

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Also perform the relevant manual checks:

- The affected user journey works end to end.
- Role-restricted controls are hidden or disabled for unauthorised roles.
- Loading, empty, success, and error states render correctly.
- Light and dark themes work.
- No console errors, layout overflow, or broken images.

## 8. Branch, commit, and pull-request conventions

Branches:

- `feat/<scope>` — new capability
- `fix/<scope>` — bug fix
- `refactor/<scope>` — structural change with no behaviour change
- `docs/<scope>` — documentation
- `chore/<scope>` — tooling or maintenance

Commit messages use a concise imperative subject, for example:

```text
Add payment IDOR regression tests
Fix checkout duplicate-submit guard
Refactor delivery assignment to use service helper
```

Each pull request must state:

- What changed and why.
- Which capability from the PRD baseline is affected.
- Whether behaviour, API contracts, tokens, or business rules changed.
- How it was verified (commands and manual checks).
- Any migration, rollout, or rollback notes.

## 9. Review checklist

- [ ] Change starts from the current baseline and preserves working behaviour.
- [ ] One capability or concern; no unrelated rewrites or formatting churn.
- [ ] Backend endpoint is in the owning service, not the gateway.
- [ ] Authorization and ownership checks are server-side.
- [ ] Public API paths and response shapes remain compatible.
- [ ] Business-rule changes have regression tests.
- [ ] Frontend uses the shared API client, primitives, and tokens.
- [ ] Loading, empty, success, and error states are handled.
- [ ] Light and dark themes work; responsive layouts verified.
- [ ] `make check`, `make test`, `tsc`, and `npm run build` pass as applicable.
- [ ] `Architecture.md`, `PRD-Statement.md`, or `Design.md` updated when required.
- [ ] No secrets, generated databases, or build artifacts included.

## 10. AI coding agents

AI agents follow the same rules as human contributors, plus:

- Read `Architecture.md`, `PRD-Statement.md`, `Design.md`, and this file
  before editing.
- Do not infer missing behaviour. Inspect the current route, service,
  schema, and tests.
- Do not perform repository-wide rewrites, framework migrations, folder
  reorganisations, or design refreshes unless explicitly requested.
- Keep changes scoped to the requested capability and preserve unrelated
  working code.
- Run the required verification commands and report the actual results.
- Never claim a build, test, integration, or deployment succeeded without
  evidence.

## 11. Secrets and data

Never commit:

- `.env` files or real environment values
- credentials, API keys, private keys, or tokens
- production connection strings
- `dev.db`, `test.db`, or other generated databases
- `frontend/dist/` or dependency directories

Use `.env.example` for documented placeholders and the hosting platform’s
secret manager for deployed environments.
