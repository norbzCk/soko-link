# Backend Services

Each folder is a business capability with its own router and domain helpers.
The FastAPI gateway in `backend/api/main.py` composes them into one deployable
API today.

| Package | Responsibility |
| --- | --- |
| `identity` | Auth, users, customers, Supabase bridge |
| `sellers` | Seller accounts and seller-side order operations |
| `catalog` | Products, providers, RFQs |
| `orders` | Checkout, order state, inventory, status history |
| `payments` | Transactions, attempts, provider adapters |
| `delivery` | Logistics accounts and delivery execution |
| `notifications` | In-app and email notifications |
| `intelligence` | Analytics, marketplace insights, AI assistant |
| `disputes` | Dispute workflow |

Rules:

- Routers are exported as `router` from the service package module.
- Only public helper functions may be imported by another service.
- Do not import `backend.api` from a service.
- Keep service-specific DTOs local unless more than one service needs them.
