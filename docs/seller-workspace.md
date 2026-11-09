# Seller Workspace

The seller workspace is the authenticated business-user surface for catalogue
moderation, inventory, fulfilment, quotations, finance and account security.
It is implemented by `backend/services/sellers/workspace.py` and mounted at
`/seller` by `backend/api/main.py`.

Seller endpoints require a `BusinessUser` with an approved business role. Admin
moderation and payout verification live under `/superadmin` in
`backend/api/routers/admin.py`. See [rbac-permissions.md](rbac-permissions.md)
for the role matrix.

## Seller API

| Area | Endpoints |
| --- | --- |
| Dashboard/profile | `GET /seller/dashboard`, `GET/PUT /seller/profile`, `POST /seller/verification` |
| Catalogue | `GET/POST /seller/products`, `GET/PUT /seller/products/{id}`, `POST /seller/products/{id}/submit`, `archive`, `restore`, `duplicate` |
| Inventory | `GET /seller/inventory`, `GET /seller/inventory/alerts`, `GET /seller/inventory/movements`, `POST /seller/inventory/adjust` |
| Orders | `GET /seller/orders`, `GET /seller/orders/{id}`, `PATCH /seller/orders/{id}/decision`, `PATCH /seller/orders/{id}/status`, `POST /seller/orders/{id}/assign-delivery` |
| Deliveries | `GET /seller/deliveries`, `GET /seller/deliveries/{id}`, `PATCH /seller/deliveries/{id}/instructions` |
| RFQs/quotations | `GET /seller/rfqs`, `GET /seller/rfqs/{id}`, `POST /seller/rfqs/{id}/quotations`, `POST /seller/rfqs/{id}/clarifications`, `GET /seller/quotations`, `POST /seller/quotations/{id}/withdraw` |
| Customers/threads | `GET /seller/customers`, `GET /seller/customers/{buyer_id}`, `GET /seller/threads`, `GET/POST /seller/threads/{id}/messages` |
| Reviews | `GET /seller/reviews`, `POST /seller/reviews/{sale_id}/reply`, `POST /seller/reviews/{sale_id}/report` |
| Promotions | `GET/POST /seller/promotions`, `PATCH /seller/promotions/{id}` |
| Analytics | `GET /seller/analytics`, `GET /seller/analytics/export?type=sales\|inventory\|finance` |
| Finance | `GET /seller/finance/overview`, `GET /seller/finance/transactions`, `GET/PUT /seller/payout-account`, `GET/POST /seller/payouts` |
| Disputes | `GET /seller/disputes`, `GET /seller/disputes/{id}`, `POST /seller/disputes`, `POST /seller/disputes/{id}/messages` |
| Settings | `GET /seller/settings`, `POST /seller/settings/password`, `DELETE /seller/settings/sessions/{id}`, `POST /seller/settings/sessions/revoke-all` |

## Isolation rules

- Product, inventory, order and delivery lookups always filter by the current
  `BusinessUser.seller_id`/owner id.
- Legacy sales may have `Sale.seller_id` unset. The fallback accepts a sale only
  when `seller_id IS NULL` **and** the provider name matches the business name.
- Quotations are private to the submitting seller. RFQ buyers see a quotation,
  but other sellers cannot list or modify it.
- Payout accounts and payout requests are seller-owned. Only verified accounts
  can request payouts.
- Customer records are derived from orders belonging to the seller; they are not
  a global customer directory.
- Admin-only moderation and payout actions require `super_admin` or `owner`.

## Catalogue and inventory

Products use the statuses `draft`, `pending`, `approved`, `rejected` and
`archived`. New products may be saved as drafts or submitted for review in one
request. Approved listings become visible to buyers; material edits return the
product to moderation. Archiving removes a listing from the storefront without
deleting its history.

Inventory changes are append-only `InventoryMovement` rows. Supported movement
types include receipts, returns, damage, loss, signed adjustments and
corrections. Negative stock is rejected. Every adjustment records the resulting
balance, actor, reason and optional reference.

## Order and delivery lifecycle

Seller order transitions follow `backend/services/orders/order_state.py`:

```text
Pending -> Confirmed -> Packed -> Ready For Shipping -> Shipped
Pending/Confirmed/Packed/Ready For Shipping -> Cancelled
Delivery Failed -> Ready For Shipping / Cancelled
Received and Cancelled are terminal
```

Delivery assignment is allowed only after the customer payment is settled.
Sellers can edit instructions while a delivery is not delivered or cancelled.
Status history and audit records are written through the shared order runtime.

## Finance

Revenue and balances are calculated from completed `PaymentTransaction` rows
only. Delivery fees are excluded from seller revenue. The platform fee defaults
to 5% (`SELLER_PLATFORM_FEE_PERCENT`). Paid cancelled orders are shown as pending
refunds until the payment provider confirms settlement.

Payout accounts are masked before storage/display and require administrator
verification. The minimum payout defaults to `SELLER_MIN_PAYOUT_AMOUNT=10000`.
Payout requests support an optional idempotency key to prevent duplicates.

## Security and current limitations

- Password changes revoke all refresh sessions, including the current device.
- Session listing/revocation is scoped to the seller identity.
- MFA is not implemented and reports `not_configured`.
- There is no standalone refund model; refunds are derived from paid cancelled
  orders.
- Team member management and full campaign approval workflows are not yet
  implemented. Promotions are limited to approved, active products, a maximum
  duration of 90 days and a maximum 90% discount.
- The frontend seller workspace is reachable at `/app/seller`, with catalogue,
  orders, growth, finance and workspace pages.
