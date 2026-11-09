# Service Boundaries

Each service package owns its HTTP router and domain logic. The gateway mounts
the routers without changing their public paths.

| Service | Package | Owns | Main routes |
| --- | --- | --- | --- |
| Identity | `backend/services/identity` | Authentication, tokens, customers, Supabase identity bridge | `/auth/*`, `/customers/*` |
| Sellers | `backend/services/sellers` | Seller registration, profiles, catalogue moderation, inventory, order fulfilment, quotations, finance and workspace | `/business/*`, `/seller/*` |
| Catalog | `backend/services/catalog` | Products, providers, RFQs, image uploads | `/products/*`, `/providers/*`, `/rfq/*` |
| Orders | `backend/services/orders` | Checkout, order lifecycle, inventory reservations, status sync | `/orders/*` |
| Payments | `backend/services/payments` | Payment attempts, transactions, provider callbacks | `/payments/*` |
| Delivery | `backend/services/delivery` | Logistics accounts, dispatch, tracking, proof of delivery | `/logistics/*` |
| Notifications | `backend/services/notifications` | In-app notifications, email rendering, broadcasts | `/notifications/*` |
| Intelligence | `backend/services/intelligence` | Dashboard analytics, marketplace insights, AI assistant | `/dashboard/*`, `/marketplace/*`, `/assistant/*` |
| Disputes | `backend/services/disputes` | Dispute creation, review and resolution | `/disputes/*` |
| Gateway | `backend/api` | App wiring, CORS, static frontend, health, superadmin | `/healthz`, `/superadmin/*` |

## Dependency direction

```text
api  ──────►  services  ──────►  shared
 │              │                  │
 │              └── may call other service modules through their public helpers
 └── must not be imported by services
```

Cross-service calls are currently normal Python imports. Keep them explicit and
limited to public helper functions. Do not import another service's router.

## Data ownership today

The current database is shared. The table groups below are the intended future
ownership boundary:

- Identity: `users`, `refresh_tokens`, `token_blocklist`, `customers`
- Sellers: `business_users`, `business_metrics`, `business_verifications`, `seller_payout_accounts`, `seller_payouts`, `promotions`
- Catalog: `products`, `providers`, `rfqs`, `inventory_movements`, `quotations`, `quotation_events`, `rfq_clarifications`, `review_replies`, `review_reports`
- Orders: `orders`, `order_items`, `order_status_history`, `inventory_reservations`, legacy `sales`
- Payments: `payment_transactions`, `payment_attempts`
- Delivery: `delivery_orders`, `shipment_events`, `logistics_users`, `logistics_metrics`
- Notifications: `notifications`
- Messaging: `conversation_threads`, `conversation_participants`, `conversation_messages`, `message_receipts`
- Intelligence: `assistant_conversations`, `assistant_conversation_messages`
- Auditing: `audit_logs`

## Rules for contributors

- Add new endpoints to the service that owns the capability, not to `main.py`.
- Put transport-only/global endpoints (health, frontend serving) in `backend/api`.
- Put shared DTOs in `backend/shared/schemas` only when more than one service uses them.
- If a helper is used by one service only, keep it inside that service.
- Update this document when a new service or ownership boundary is added.
