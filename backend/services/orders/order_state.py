"""Shared order lifecycle rules.

The marketplace exposes order status changes through several entry points
(sales, seller dashboard, logistics, payment callbacks). Keeping the valid
transitions and the linked Order/OrderItem synchronisation in one module
prevents those paths from drifting apart.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.services.orders.order_runtime import log_order_status, record_audit
from backend.shared.models import Order, OrderItem, PaymentTransaction, Sale

ORDER_STATUSES = {
    "Pending",
    "Confirmed",
    "Packed",
    "Ready For Shipping",
    "Shipped",
    "Delivery Failed",
    "Received",
    "Cancelled",
}

TRANSITIONS = {
    "Pending": {"Confirmed", "Cancelled"},
    "Confirmed": {"Packed", "Cancelled"},
    "Packed": {"Ready For Shipping", "Cancelled"},
    "Ready For Shipping": {"Shipped", "Cancelled"},
    "Shipped": set(),
    "Delivery Failed": {"Ready For Shipping", "Cancelled"},
    "Received": set(),
    "Cancelled": set(),
}

CANCELLABLE_BY_CUSTOMER = {"Pending", "Confirmed"}

# Cash-on-delivery orders are "settled" for fulfilment purposes even though
# the money is collected at the door.
SETTLED_PAYMENT_STATUSES = {"completed", "pending_delivery"}


def normalize_status(raw_status: str | None) -> str:
    status = (raw_status or "").strip().title()
    if status == "Delivered":
        return "Received"
    if status in ORDER_STATUSES:
        return status
    return "Received"


def requested_status(raw_status: str | None) -> str | None:
    status = (raw_status or "").strip().title()
    if status == "Delivered":
        return "Received"
    if status in ORDER_STATUSES:
        return status
    return None


def can_transition(current_status: str | None, target_status: str) -> bool:
    return target_status in TRANSITIONS.get(normalize_status(current_status), set())


def sale_has_settled_payment(db: Session, sale_id: int) -> bool:
    return (
        db.query(PaymentTransaction)
        .filter(
            PaymentTransaction.order_id == sale_id,
            PaymentTransaction.status.in_(SETTLED_PAYMENT_STATUSES),
        )
        .first()
        is not None
    )


def linked_order(db: Session, sale: Sale) -> Order | None:
    if sale.order_id:
        order = db.query(Order).filter(Order.id == sale.order_id).first()
        if order:
            return order
    return db.query(Order).filter(Order.legacy_sale_id == sale.id).first()


def linked_order_items(db: Session, sale: Sale, order: Order | None = None) -> list[OrderItem]:
    order = order or linked_order(db, sale)
    if order:
        return db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    if sale.order_item_id:
        item = db.query(OrderItem).filter(OrderItem.id == sale.order_item_id).first()
        return [item] if item else []
    item = db.query(OrderItem).filter(OrderItem.legacy_sale_id == sale.id).first()
    return [item] if item else []


def sync_sale_order_state(
    db: Session,
    sale: Sale,
    *,
    status: str,
    reason: str | None,
    actor,
    metadata: dict | None = None,
) -> None:
    """Propagate a Sale status change to its linked Order and OrderItems and
    write the status/audit trail in one place."""
    order = linked_order(db, sale)
    for item in linked_order_items(db, sale, order):
        item.status = status
        db.add(item)

    if not order:
        return

    order.status = status
    order.status_reason = reason
    db.add(order)
    log_order_status(
        db,
        order_id=order.id,
        sale_id=sale.id,
        status=status,
        reason=reason,
        actor=actor,
        metadata=metadata,
    )
    record_audit(
        db,
        actor=actor,
        entity_type="order",
        entity_id=order.id,
        action=f"order.status.{status.lower().replace(' ', '_')}",
        details={"sale_id": sale.id, "reason": reason, **(metadata or {})},
    )
