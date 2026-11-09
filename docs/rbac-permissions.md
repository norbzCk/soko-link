# RBAC and Permissions

Canonical identity roles are defined in
`backend/services/identity/identity_service.py`.

| Role | Scope |
| --- | --- |
| `CUSTOMER` (`user`) | Customer dashboard, checkout, payments, own orders and profile |
| `SELLER` (`seller`) | Seller workspace at `/seller`; only own business data |
| `LOGISTICS_PROVIDER` (`logistics`) | Logistics workspace, assigned deliveries |
| `ADMINISTRATOR` (`admin`) | Administrative dashboard and operational views |
| `ANALYST` (`analyst`) | Read-only analytics workspace |
| `SUPER_ADMIN` (`super_admin`) | User/business administration, moderation, payouts, IAM |
| `OWNER` (`owner`) | Platform-owner access equivalent to super admin surfaces |

Role application statuses are `PENDING`, `APPROVED`, `REJECTED` and
`SUSPENDED`. Account statuses are `PENDING_VERIFICATION`, `ACTIVE`,
`SUSPENDED` and `DISABLED`.

## Seller access

A seller may read or mutate only resources tied to their own business id:

- Products, inventory movements and promotions.
- Orders, deliveries, customers and order conversations.
- Quotations and clarification questions.
- Payout accounts, payouts, reviews replies, disputes and settings.

Legacy order/sale rows without a seller id are accepted only when the provider
name matches the authenticated business name. This prevents a seller from
claiming another seller's legacy record.

## Admin access

Admin moderation and finance endpoints require `super_admin` or `owner`:

- `GET /superadmin/products/moderation`
- `PATCH /superadmin/products/{id}/moderation`
- `GET /superadmin/payouts`
- `PATCH /superadmin/payouts/{id}`
- `GET /superadmin/payout-accounts`
- `PATCH /superadmin/payout-accounts/{id}`
- `GET /superadmin/review-reports`
- `PATCH /superadmin/review-reports/{id}`

Payout transitions are constrained: `requested` may become `approved`,
`rejected` or `processing`; `approved` may become `processing`, `completed` or
`rejected`; `processing` may become `completed` or `rejected`.

## Verification

Business verification uses `national_id`, `business_license`, `passport` or
`tax_certificate` documents. Submitting documents sets the business status to
`pending`; only an administrator can mark it `verified` or `rejected`.
