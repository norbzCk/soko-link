# SokoLink Frontend

React + TypeScript + Vite client for the SokoLink marketplace.

## Structure

```text
src/
├── app/          # App composition and routing
├── components/   # Reusable presentation components
├── features/     # Feature modules: auth, cart, layout, logistics
├── lib/          # HTTP client and infrastructure adapters
├── pages/        # Route-level screens
├── config/       # Runtime configuration
├── styles/       # Global styles
└── types/        # Shared TypeScript domain types
```

## Run

```bash
npm install
npm run dev
```

The local app defaults to `http://localhost:8000` for API calls.

Override the API base when needed:

```bash
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

## Build

```bash
npm run build
```

## Conventions

- Keep feature-specific components under `src/features/<feature>/`.
- Route-level screens live in `src/pages/`.
- Use `src/lib/http.ts` for API access instead of calling `fetch` directly.
- Update `src/types/domain.ts` when API contracts change.
