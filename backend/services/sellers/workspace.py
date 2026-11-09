"""Dedicated seller workspace API.

Every route in this module is scoped to the authenticated business profile.
Resource identifiers are never trusted on their own: products, sales, deliveries,
disputes, threads and quotations are always re-checked against the seller before
a response is returned or a mutation is applied.
"""

from __future__ import annotations

import csv
import io
import json
import os
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from backend.services.identity.auth import hash_password, verify_password
from backend.services.notifications.notification_service import (
    create_notification,
    resolve_subject,
    unread_count_for_subject,
)
from backend.services.orders.order_runtime import (
    create_conversation_message,
    ensure_order_thread,
    list_thread_messages,
    record_audit,
    serialize_conversation_message,
)
from backend.services.orders.order_state import TRANSITIONS, sale_has_settled_payment
from backend.services.sellers.business import (
    _ensure_order_owner,
    _inventory_overview,
    _seller_sales_query,
    _serialize_business,
    _serialize_seller_order,
    business_assign_delivery,
    business_order_decision,
    business_update_order_status,
    get_current_business_user,
)
from backend.shared.database import get_db
from backend.shared.models import (
    BusinessUser,
    BusinessVerification,
    ConversationMessage,
    ConversationThread,
    DeliveryOrder,
    Dispute,
    DisputeMessage,
    InventoryMovement,
    InventoryReservation,
    LogisticsUser,
    OrderItem,
    PaymentTransaction,
    Product,
    Promotion,
    Quotation,
    QuotationEvent,
    RefreshToken,
    ReviewReply,
    ReviewReport,
    RFQ,
    RFQClarification,
    Sale,
    SellerPayout,
    SellerPayoutAccount,
    User,
)

router = APIRouter(prefix="/seller", tags=["Seller Workspace"])

PLATFORM_FEE_PERCENT = max(0.0, min(100.0, float(os.getenv("SELLER_PLATFORM_FEE_PERCENT", "5"))))
MIN_PAYOUT_AMOUNT = max(0.0, float(os.getenv("SELLER_MIN_PAYOUT_AMOUNT", "10000")))
PAID_STATUSES = {"completed"}
PENDING_PAYMENT_STATUSES = {"pending", "processing", "pending_delivery"}
PAYOUT_RESERVED_STATUSES = {"requested", "approved", "processing", "completed"}
PRODUCT_STATUSES = {"draft", "pending", "approved", "rejected", "archived"}
MOVEMENT_TYPES = {"receipt", "adjustment", "correction", "damage", "loss", "return"}


# ---------------------------------------------------------------------------
# Serialization and ownership helpers
# ---------------------------------------------------------------------------


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _money(value) -> float:
    return round(float(value or 0), 2)


def _json_load(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _parse_datetime(value, field: str = "date") -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _product_or_404(db: Session, user: BusinessUser, product_id: int) -> Product:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.seller_id == user.id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _sale_or_404(db: Session, user: BusinessUser, sale_id: int, *, lock: bool = False) -> Sale:
    query = _seller_sales_query(db, user).filter(Sale.id == sale_id)
    if lock:
        query = query.with_for_update()
    sale = query.first()
    if not sale:
        raise HTTPException(status_code=404, detail="Order not found")
    _ensure_order_owner(sale, user)
    return sale


def _delivery_or_404(db: Session, user: BusinessUser, delivery_id: int) -> DeliveryOrder:
    delivery = (
        db.query(DeliveryOrder)
        .filter(DeliveryOrder.id == delivery_id, DeliveryOrder.seller_id == user.id)
        .first()
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return delivery


def _dispute_or_404(db: Session, user: BusinessUser, dispute_id: int) -> Dispute:
    dispute = (
        db.query(Dispute)
        .filter(Dispute.id == dispute_id, Dispute.seller_id == user.id)
        .first()
    )
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return dispute


def _thread_or_404(db: Session, user: BusinessUser, thread_id: int) -> ConversationThread:
    thread = db.query(ConversationThread).filter(ConversationThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    sale = None
    if thread.sale_id:
        sale = _seller_sales_query(db, user).filter(Sale.id == thread.sale_id).first()
    elif thread.order_id:
        order_sale = db.query(Sale).filter(Sale.order_id == thread.order_id).first()
        if order_sale:
            sale = _seller_sales_query(db, user).filter(Sale.id == order_sale.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return thread


def _product_reserved_map(db: Session, product_ids: list[int]) -> dict[int, int]:
    if not product_ids:
        return {}
    rows = (
        db.query(InventoryReservation.product_id, func.sum(InventoryReservation.reserved_quantity))
        .filter(
            InventoryReservation.product_id.in_(product_ids),
            InventoryReservation.status == "reserved",
        )
        .group_by(InventoryReservation.product_id)
        .all()
    )
    return {int(row[0]): int(row[1] or 0) for row in rows}


def _serialize_product(product: Product, reserved: int = 0) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category,
        "price": _money(product.price),
        "stock": int(product.stock or 0),
        "reserved_stock": int(reserved or 0),
        "available_stock": int(product.stock or 0),
        "low_stock_threshold": int(product.low_stock_threshold or 5),
        "is_low_stock": int(product.stock or 0) <= int(product.low_stock_threshold or 5),
        "description": product.description,
        "image_url": product.image_url,
        "unit": product.unit or "piece",
        "variants": _json_load(product.variants_json, []),
        "specifications": _json_load(product.specifications_json, {}),
        "status": product.status or "approved",
        "moderation_reason": product.moderation_reason,
        "is_active": bool(product.is_active),
        "rating_avg": _money(product.rating_avg),
        "rating_count": int(product.rating_count or 0),
        "submitted_at": _iso(product.submitted_at),
        "approved_at": _iso(product.approved_at),
        "archived_at": _iso(product.archived_at),
        "created_at": _iso(product.created_at) if hasattr(product, "created_at") else None,
    }


def _serialize_movement(movement: InventoryMovement) -> dict:
    return {
        "id": movement.id,
        "product_id": movement.product_id,
        "movement_type": movement.movement_type,
        "quantity_delta": int(movement.quantity_delta or 0),
        "balance_after": int(movement.balance_after or 0),
        "reason": movement.reason,
        "reference_type": movement.reference_type,
        "reference_id": movement.reference_id,
        "actor_type": movement.actor_type,
        "created_at": _iso(movement.created_at),
    }


def _serialize_quotation(quotation: Quotation) -> dict:
    return {
        "id": quotation.id,
        "rfq_id": quotation.rfq_id,
        "unit_price": _money(quotation.unit_price),
        "total_price": _money(quotation.total_price),
        "currency": quotation.currency,
        "lead_time_days": quotation.lead_time_days,
        "valid_until": _iso(quotation.valid_until),
        "notes": quotation.notes,
        "status": quotation.status,
        "version": int(quotation.version or 1),
        "submitted_at": _iso(quotation.submitted_at),
        "withdrawn_at": _iso(quotation.withdrawn_at),
        "accepted_at": _iso(quotation.accepted_at),
        "updated_at": _iso(quotation.updated_at),
    }


def _serialize_rfq(rfq: RFQ, quotation: Quotation | None = None, quotation_count: int = 0) -> dict:
    return {
        "id": rfq.id,
        "company_name": rfq.company_name,
        "contact_name": rfq.contact_name,
        "product_interest": rfq.product_interest,
        "category": rfq.category,
        "quantity": int(rfq.quantity or 0),
        "target_budget": rfq.target_budget,
        "notes": rfq.notes,
        "deadline": _iso(rfq.deadline),
        "status": rfq.status,
        "created_at": _iso(rfq.created_at),
        "quotation_count": int(quotation_count or 0),
        "my_quotation": _serialize_quotation(quotation) if quotation else None,
    }


def _serialize_payout(payout: SellerPayout) -> dict:
    return {
        "id": payout.id,
        "amount": _money(payout.amount),
        "currency": payout.currency,
        "status": payout.status,
        "method": payout.method,
        "destination_label": payout.destination_label,
        "reference": payout.reference,
        "note": payout.note,
        "rejection_reason": payout.rejection_reason,
        "requested_at": _iso(payout.requested_at),
        "processed_at": _iso(payout.processed_at),
    }


def _serialize_account(account: SellerPayoutAccount | None) -> dict | None:
    if not account:
        return None
    return {
        "id": account.id,
        "method": account.method,
        "account_name": account.account_name,
        "account_number_masked": account.account_number_masked,
        "status": account.status,
        "rejection_reason": account.rejection_reason,
        "verified_at": _iso(account.verified_at),
        "updated_at": _iso(account.updated_at),
    }


def _serialize_review(sale: Sale, reply: ReviewReply | None, reports: list[ReviewReport]) -> dict:
    return {
        "sale_id": sale.id,
        "product": sale.product,
        "category": sale.category,
        "rating": int(sale.rating or 0),
        "rated_at": _iso(sale.rated_at),
        "customer_id": sale.created_by,
        "order_date": sale.date.isoformat() if sale.date else None,
        "reply": (
            {
                "id": reply.id,
                "message": reply.message,
                "created_at": _iso(reply.created_at),
                "updated_at": _iso(reply.updated_at),
            }
            if reply
            else None
        ),
        "reports": [
            {"id": report.id, "reason": report.reason, "status": report.status, "created_at": _iso(report.created_at)}
            for report in reports
        ],
    }


def _serialize_promotion(promotion: Promotion, product: Product | None = None) -> dict:
    now = _now()
    starts = promotion.starts_at
    ends = promotion.ends_at
    starts_cmp = starts.replace(tzinfo=timezone.utc) if starts and starts.tzinfo is None else starts
    ends_cmp = ends.replace(tzinfo=timezone.utc) if ends and ends.tzinfo is None else ends
    effective_status = promotion.status
    if effective_status in {"active", "scheduled"}:
        if ends_cmp and ends_cmp < now:
            effective_status = "expired"
        elif starts_cmp and starts_cmp > now:
            effective_status = "scheduled"
        else:
            effective_status = "active"
    discount_price = None
    if product:
        if promotion.discount_type == "percent":
            discount_price = max(0.0, float(product.price or 0) * (1 - float(promotion.discount_value or 0) / 100))
        else:
            discount_price = max(0.0, float(product.price or 0) - float(promotion.discount_value or 0))
    return {
        "id": promotion.id,
        "product_id": promotion.product_id,
        "product_name": product.name if product else None,
        "name": promotion.name,
        "discount_type": promotion.discount_type,
        "discount_value": promotion.discount_value,
        "starts_at": _iso(promotion.starts_at),
        "ends_at": _iso(promotion.ends_at),
        "status": effective_status,
        "stored_status": promotion.status,
        "rejection_reason": promotion.rejection_reason,
        "promotional_price": _money(discount_price) if discount_price is not None else None,
        "created_at": _iso(promotion.created_at),
        "updated_at": _iso(promotion.updated_at),
    }


def _record_movement(
    db: Session,
    *,
    user: BusinessUser,
    product: Product,
    movement_type: str,
    delta: int,
    reason: str | None,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> InventoryMovement:
    movement = InventoryMovement(
        product_id=product.id,
        seller_id=user.id,
        movement_type=movement_type,
        quantity_delta=int(delta),
        balance_after=int(product.stock or 0),
        reason=reason,
        reference_type=reference_type,
        reference_id=reference_id,
        actor_type="seller",
        actor_id=user.id,
    )
    db.add(movement)
    return movement


def _notification(
    db: Session,
    user: BusinessUser,
    background_tasks: BackgroundTasks | None,
    *,
    title: str,
    message: str,
    severity: str = "info",
    action_href: str | None = "/app/seller",
    notification_type: str = "seller",
) -> None:
    recipient_type, recipient_id, email, name = resolve_subject(user)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=email,
        title=title,
        message=message,
        notification_type=notification_type,
        severity=severity,
        action_href=action_href,
        send_email=bool(email),
        email_subject=title,
        email_body=f"Hello {name},\n\n{message}\n\nSokoLnk Seller Workspace",
        background_tasks=background_tasks,
    )


def _seller_completed_sale_ids(db: Session, sale_ids: list[int]) -> set[int]:
    if not sale_ids:
        return set()
    rows = (
        db.query(PaymentTransaction.order_id)
        .filter(
            PaymentTransaction.order_id.in_(sale_ids),
            PaymentTransaction.status.in_(PAID_STATUSES),
        )
        .all()
    )
    return {int(row[0]) for row in rows if row[0] is not None}


def _finance_snapshot(db: Session, user: BusinessUser, date_from: date | None = None, date_to: date | None = None) -> dict:
    sales_query = _seller_sales_query(db, user)
    if date_from:
        sales_query = sales_query.filter(Sale.date >= date_from)
    if date_to:
        sales_query = sales_query.filter(Sale.date <= date_to)
    sales = sales_query.all()
    sale_ids = [sale.id for sale in sales]
    paid_ids = _seller_completed_sale_ids(db, sale_ids)

    paid_sales = [sale for sale in sales if sale.id in paid_ids]
    cancelled_paid = [sale for sale in paid_sales if (sale.status or "") == "Cancelled"]
    successful_paid = [sale for sale in paid_sales if (sale.status or "") != "Cancelled"]

    gross_revenue = _money(sum(float((sale.quantity or 0) * (sale.unit_price or 0)) for sale in successful_paid))
    commission = _money(gross_revenue * PLATFORM_FEE_PERCENT / 100)
    net_revenue = _money(gross_revenue - commission)
    refunds_pending = _money(sum(float((sale.quantity or 0) * (sale.unit_price or 0)) for sale in cancelled_paid))

    pending_rows = (
        db.query(func.sum(PaymentTransaction.amount))
        .filter(
            PaymentTransaction.order_id.in_(sale_ids),
            PaymentTransaction.status.in_(PENDING_PAYMENT_STATUSES),
        )
        .scalar()
        if sale_ids
        else 0
    )
    pending_settlement = _money(pending_rows)

    payouts = db.query(SellerPayout).filter(SellerPayout.seller_id == user.id).all()
    reserved = _money(sum(float(p.amount or 0) for p in payouts if p.status in PAYOUT_RESERVED_STATUSES))
    paid_out = _money(sum(float(p.amount or 0) for p in payouts if p.status == "completed"))
    pending_payouts = _money(
        sum(float(p.amount or 0) for p in payouts if p.status in {"requested", "approved", "processing"})
    )
    available = _money(max(0.0, net_revenue - reserved))

    return {
        "currency": "NGN",
        "gross_revenue": gross_revenue,
        "platform_fee_percent": PLATFORM_FEE_PERCENT,
        "platform_fee": commission,
        "net_revenue": net_revenue,
        "pending_settlement": pending_settlement,
        "refunds_pending": refunds_pending,
        "available_for_payout": available,
        "pending_payouts": pending_payouts,
        "paid_out": paid_out,
        "successful_orders": len(successful_paid),
        "paid_transactions": len(paid_sales),
    }


# ---------------------------------------------------------------------------
# Dashboard and profile
# ---------------------------------------------------------------------------


@router.get("/dashboard")
def seller_dashboard(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    user = current_user
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    all_sales = _seller_sales_query(db, user).all()
    paid_ids = _seller_completed_sale_ids(db, [sale.id for sale in all_sales])

    def revenue(rows: list[Sale]) -> float:
        return _money(
            sum(
                float((row.quantity or 0) * (row.unit_price or 0))
                for row in rows
                if row.id in paid_ids and (row.status or "") != "Cancelled"
            )
        )

    recent = (
        _seller_sales_query(db, user)
        .order_by(Sale.date.desc(), Sale.id.desc())
        .limit(6)
        .all()
    )
    inventory = _inventory_overview(db, user)
    finance = _finance_snapshot(db, user, date_from, date_to)
    pending_orders = [sale for sale in all_sales if (sale.status or "Pending") in {"Pending", "Confirmed", "Packed"}]
    ratings = [int(sale.rating) for sale in all_sales if sale.rating]
    recipient_type, recipient_id, _, _ = resolve_subject(user)

    pending_products = db.query(Product).filter(
        Product.seller_id == user.id, Product.status == "pending"
    ).count()
    rejected_products = db.query(Product).filter(
        Product.seller_id == user.id, Product.status == "rejected"
    ).count()
    open_disputes = db.query(Dispute).filter(
        Dispute.seller_id == user.id, Dispute.status == "open"
    ).count()
    new_quotations = (
        db.query(Quotation)
        .filter(
            Quotation.seller_id == user.id,
            Quotation.status.in_(["submitted", "revised"]),
        )
        .count()
    )
    pending_rfqs = db.query(RFQ).filter(RFQ.status.in_(["New", "Quoted"])).count()

    actions = []
    if pending_orders:
        actions.append({"id": "orders", "label": f"{len(pending_orders)} orders need a decision", "href": "/app/seller/orders"})
    if inventory["low_stock"] or inventory["out_of_stock"]:
        actions.append(
            {
                "id": "inventory",
                "label": f"{inventory['low_stock'] + inventory['out_of_stock']} products need restocking",
                "href": "/app/seller/catalog",
            }
        )
    if pending_products or rejected_products:
        actions.append(
            {
                "id": "moderation",
                "label": f"{pending_products + rejected_products} products in moderation",
                "href": "/app/seller/catalog",
            }
        )
    if open_disputes:
        actions.append({"id": "disputes", "label": f"{open_disputes} open disputes", "href": "/app/seller/workspace"})

    return {
        "business": _serialize_business(user),
        "summary": {
            "revenue_today": revenue([sale for sale in all_sales if sale.date == today]),
            "revenue_week": revenue([sale for sale in all_sales if sale.date and sale.date >= week_start]),
            "revenue_month": revenue([sale for sale in all_sales if sale.date and sale.date >= month_start]),
            "revenue_total": revenue(all_sales),
            "orders_total": len(all_sales),
            "orders_pending": len(pending_orders),
            "orders_completed": len([sale for sale in all_sales if (sale.status or "") in {"Received", "Delivered"}]),
            "orders_cancelled": len([sale for sale in all_sales if (sale.status or "") == "Cancelled"]),
            "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "rating_count": len(ratings),
            "unread_notifications": unread_count_for_subject(db, recipient_type, recipient_id),
            "pending_rfqs": pending_rfqs,
            "pending_products": pending_products,
            "open_disputes": open_disputes,
            "my_active_quotations": new_quotations,
        },
        "finance": finance,
        "inventory": inventory,
        "recent_orders": [item for item in _serialize_seller_rows(db, recent)],
        "actions": actions,
    }


def _serialize_seller_rows(db: Session, sales: list[Sale]) -> list[dict]:
    from backend.services.sellers.business import _serialize_seller_orders

    return _serialize_seller_orders(db, sales)


@router.get("/profile")
def get_seller_profile(current_user: BusinessUser = Depends(get_current_business_user)):
    return {"business": _serialize_business(current_user)}


@router.put("/profile")
def update_seller_profile(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    user = current_user
    locked = ["business_name", "owner_name", "phone", "email"]
    attempted = [field for field in locked if field in payload and payload.get(field) not in (None, "", getattr(user, field))]
    if attempted:
        raise HTTPException(
            status_code=400,
            detail=f"{', '.join(attempted)} cannot be changed here; contact support to update verified business identity details.",
        )

    editable = [
        "category",
        "description",
        "region",
        "area",
        "street",
        "shop_number",
        "operating_hours",
        "shop_logo_url",
        "shop_images",
        "profile_photo",
        "website_url",
        "social_facebook",
        "social_instagram",
        "social_whatsapp",
        "social_x",
    ]
    for field in editable:
        if field in payload:
            value = payload.get(field)
            setattr(user, field, value.strip() if isinstance(value, str) and value.strip() else value)
    if "auto_confirm" in payload:
        user.auto_confirm = bool(payload.get("auto_confirm"))

    db.add(user)
    record_audit(db, actor=user, entity_type="business_user", entity_id=user.id, action="seller.profile.update")
    db.commit()
    db.refresh(user)
    return {"message": "Storefront updated", "business": _serialize_business(user)}


@router.post("/verification")
def submit_seller_verification(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    user = current_user
    if user.verification_status == "verified":
        raise HTTPException(status_code=400, detail="Business is already verified")
    document_type = (payload.get("document_type") or "").strip()
    document_url = (payload.get("document_url") or "").strip()
    if document_type not in {"national_id", "business_license", "passport", "tax_certificate"}:
        raise HTTPException(status_code=400, detail="Unsupported document type")
    if not document_url:
        raise HTTPException(status_code=400, detail="Document URL is required")

    existing = (
        db.query(BusinessVerification)
        .filter(BusinessVerification.business_id == user.id, BusinessVerification.status == "pending")
        .first()
    )
    if existing:
        existing.document_type = document_type
        existing.document_url = document_url
        existing.submitted_at = _now()
        db.add(existing)
    else:
        db.add(
            BusinessVerification(
                business_id=user.id,
                document_type=document_type,
                document_url=document_url,
                status="pending",
            )
        )
    user.verification_status = "pending"
    _notification(
        db,
        user,
        background_tasks,
        title="Verification documents received",
        message="Your business verification documents are now under review.",
        severity="info",
        notification_type="verification",
    )
    db.commit()
    return {"message": "Verification documents submitted", "status": "pending"}


# ---------------------------------------------------------------------------
# Products and catalogue moderation
# ---------------------------------------------------------------------------


def _validate_product_payload(payload: dict, *, partial: bool = False) -> None:
    if not partial or "name" in payload:
        name = (payload.get("name") or "").strip()
        if len(name) < 2:
            raise HTTPException(status_code=400, detail="Product name is required")
    if not partial or "category" in payload:
        category = (payload.get("category") or "").strip()
        if len(category) < 2:
            raise HTTPException(status_code=400, detail="Product category is required")
    if not partial or "price" in payload:
        try:
            price = float(payload.get("price"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Price must be a number")
        if price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
    if "low_stock_threshold" in payload:
        try:
            threshold = int(payload.get("low_stock_threshold"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Low stock threshold must be a whole number")
        if threshold < 0:
            raise HTTPException(status_code=400, detail="Low stock threshold cannot be negative")
    if "variants" in payload and payload.get("variants") is not None:
        if not isinstance(payload.get("variants"), list):
            raise HTTPException(status_code=400, detail="Variants must be a list")
        if len(payload.get("variants")) > 50:
            raise HTTPException(status_code=400, detail="Too many variants")


@router.get("/products")
def list_seller_products(
    status: str | None = None,
    q: str | None = None,
    low_stock: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(Product).filter(Product.seller_id == current_user.id)
    if status:
        if status not in PRODUCT_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown product status")
        query = query.filter(Product.status == status)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Product.name.ilike(term), Product.category.ilike(term)))
    if low_stock:
        query = query.filter(Product.stock <= func.coalesce(Product.low_stock_threshold, 5))
    total = query.count()
    products = query.order_by(Product.id.desc()).offset(offset).limit(limit).all()
    reserved = _product_reserved_map(db, [product.id for product in products])
    return {
        "items": [_serialize_product(product, reserved.get(product.id, 0)) for product in products],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/products", status_code=201)
def create_seller_product(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    _validate_product_payload(payload)
    submit = bool(payload.get("submit", False))
    try:
        stock = int(payload.get("stock") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Stock must be a whole number")
    if stock < 0:
        raise HTTPException(status_code=400, detail="Opening stock cannot be negative")

    variants = payload.get("variants") or []
    specifications = payload.get("specifications") or {}
    product = Product(
        name=payload.get("name").strip(),
        category=payload.get("category").strip(),
        price=float(payload.get("price")),
        stock=stock,
        description=(payload.get("description") or "").strip() or None,
        image_url=(payload.get("image_url") or "").strip() or None,
        seller_id=current_user.id,
        is_active=False,
        status="pending" if submit else "draft",
        submitted_at=_now() if submit else None,
        unit=(payload.get("unit") or "piece").strip(),
        variants_json=json.dumps(variants),
        specifications_json=json.dumps(specifications),
        low_stock_threshold=int(payload.get("low_stock_threshold") or 5),
    )
    db.add(product)
    db.flush()
    if stock:
        _record_movement(
            db,
            user=current_user,
            product=product,
            movement_type="receipt",
            delta=stock,
            reason="Opening stock",
            reference_type="product_creation",
        )
    record_audit(
        db,
        actor=current_user,
        entity_type="product",
        entity_id=product.id,
        action="seller.product.create",
        details={"status": product.status},
    )
    if submit:
        _notification(
            db,
            current_user,
            background_tasks,
            title="Product submitted for review",
            message=f"{product.name} was submitted for marketplace review.",
            notification_type="catalog",
        )
    db.commit()
    db.refresh(product)
    return {"message": "Product submitted for review" if submit else "Draft saved", "product": _serialize_product(product)}


@router.get("/products/{product_id}")
def get_seller_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    product = _product_or_404(db, current_user, product_id)
    reserved = _product_reserved_map(db, [product.id])
    return {"product": _serialize_product(product, reserved.get(product.id, 0))}


@router.put("/products/{product_id}")
def update_seller_product(
    product_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.seller_id == current_user.id)
        .with_for_update()
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.status == "archived":
        raise HTTPException(status_code=400, detail="Restore the product before editing it")
    if "stock" in payload and int(payload.get("stock") or 0) != int(product.stock or 0):
        raise HTTPException(status_code=400, detail="Stock changes must be recorded through inventory adjustments")
    _validate_product_payload(payload, partial=True)

    material_fields = {"name", "category", "price", "description", "image_url", "unit", "variants", "specifications"}
    changed_material = False
    for field in ["name", "category", "description", "image_url", "unit"]:
        if field in payload:
            value = payload.get(field)
            value = value.strip() if isinstance(value, str) else value
            if value != getattr(product, field):
                setattr(product, field, value or None)
                changed_material = changed_material or field in material_fields
    if "price" in payload:
        new_price = float(payload.get("price"))
        if new_price != float(product.price or 0):
            product.price = new_price
            changed_material = True
    if "variants" in payload:
        encoded = json.dumps(payload.get("variants") or [])
        if encoded != (product.variants_json or "[]"):
            product.variants_json = encoded
            changed_material = True
    if "specifications" in payload:
        encoded = json.dumps(payload.get("specifications") or {})
        if encoded != (product.specifications_json or "{}"):
            product.specifications_json = encoded
            changed_material = True
    if "low_stock_threshold" in payload:
        product.low_stock_threshold = int(payload.get("low_stock_threshold"))

    if changed_material and (product.status or "draft") in {"approved", "rejected", "pending"}:
        product.status = "pending"
        product.submitted_at = _now()
        product.approved_at = None
        product.approved_by = None
        product.moderation_reason = None
        product.is_active = False
        _notification(
            db,
            current_user,
            background_tasks,
            title="Product changes need review",
            message=f"Your changes to {product.name} were submitted for marketplace review.",
            notification_type="catalog",
        )

    db.add(product)
    record_audit(
        db,
        actor=current_user,
        entity_type="product",
        entity_id=product.id,
        action="seller.product.update",
        details={"resubmitted": changed_material, "status": product.status},
    )
    db.commit()
    db.refresh(product)
    return {
        "message": "Changes submitted for review" if changed_material else "Product updated",
        "product": _serialize_product(product),
    }


@router.post("/products/{product_id}/submit")
def submit_seller_product(
    product_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    product = _product_or_404(db, current_user, product_id)
    if product.status not in {"draft", "rejected"}:
        raise HTTPException(status_code=400, detail="Only drafts or rejected products can be submitted")
    if float(product.price or 0) <= 0:
        raise HTTPException(status_code=400, detail="Set a valid price before submitting")
    if not (product.description or "").strip():
        raise HTTPException(status_code=400, detail="Add a product description before submitting")
    product.status = "pending"
    product.submitted_at = _now()
    product.moderation_reason = None
    product.is_active = False
    db.add(product)
    record_audit(db, actor=current_user, entity_type="product", entity_id=product.id, action="seller.product.submit")
    _notification(
        db,
        current_user,
        background_tasks,
        title="Product submitted for review",
        message=f"{product.name} was submitted for marketplace review.",
        notification_type="catalog",
    )
    db.commit()
    return {"message": "Product submitted for review", "product": _serialize_product(product)}


@router.post("/products/{product_id}/archive")
def archive_seller_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    product = _product_or_404(db, current_user, product_id)
    if product.status == "archived":
        return {"message": "Product already archived", "product": _serialize_product(product)}
    product.status = "archived"
    product.is_active = False
    product.archived_at = _now()
    db.add(product)
    record_audit(db, actor=current_user, entity_type="product", entity_id=product.id, action="seller.product.archive")
    db.commit()
    return {"message": "Product archived and removed from the storefront", "product": _serialize_product(product)}


@router.post("/products/{product_id}/restore")
def restore_seller_product(
    product_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    product = _product_or_404(db, current_user, product_id)
    if product.status != "archived":
        raise HTTPException(status_code=400, detail="Only archived products can be restored")
    product.status = "pending"
    product.submitted_at = _now()
    product.archived_at = None
    product.is_active = False
    db.add(product)
    _notification(
        db,
        current_user,
        background_tasks,
        title="Product restored for review",
        message=f"{product.name} was restored and submitted for marketplace review.",
        notification_type="catalog",
    )
    db.commit()
    return {"message": "Product restored and submitted for review", "product": _serialize_product(product)}


@router.post("/products/{product_id}/duplicate", status_code=201)
def duplicate_seller_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    source = _product_or_404(db, current_user, product_id)
    copy = Product(
        name=f"{source.name} copy",
        category=source.category,
        price=source.price,
        stock=0,
        description=source.description,
        image_url=source.image_url,
        seller_id=current_user.id,
        is_active=False,
        status="draft",
        unit=source.unit,
        variants_json=source.variants_json,
        specifications_json=source.specifications_json,
        low_stock_threshold=source.low_stock_threshold,
    )
    db.add(copy)
    db.flush()
    record_audit(db, actor=current_user, entity_type="product", entity_id=copy.id, action="seller.product.duplicate")
    db.commit()
    db.refresh(copy)
    return {"message": "Draft copy created", "product": _serialize_product(copy)}


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


@router.get("/inventory")
def seller_inventory(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    overview = _inventory_overview(db, current_user)
    products = db.query(Product).filter(Product.seller_id == current_user.id).order_by(Product.id.desc()).all()
    reserved = _product_reserved_map(db, [product.id for product in products])
    overview["items"] = [_serialize_product(product, reserved.get(product.id, 0)) for product in products]
    return overview


@router.get("/inventory/alerts")
def seller_inventory_alerts(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    products = (
        db.query(Product)
        .filter(
            Product.seller_id == current_user.id,
            Product.status != "archived",
            Product.stock <= func.coalesce(Product.low_stock_threshold, 5),
        )
        .order_by(Product.stock.asc())
        .all()
    )
    return {
        "items": [
            {
                "product_id": product.id,
                "product_name": product.name,
                "stock": int(product.stock or 0),
                "threshold": int(product.low_stock_threshold or 5),
                "severity": "critical" if int(product.stock or 0) == 0 else "low",
            }
            for product in products
        ]
    }


@router.get("/inventory/movements")
def seller_inventory_movements(
    product_id: int | None = None,
    movement_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(InventoryMovement).filter(InventoryMovement.seller_id == current_user.id)
    if product_id is not None:
        _product_or_404(db, current_user, product_id)
        query = query.filter(InventoryMovement.product_id == product_id)
    if movement_type:
        query = query.filter(InventoryMovement.movement_type == movement_type)
    total = query.count()
    rows = query.order_by(InventoryMovement.id.desc()).offset(offset).limit(limit).all()
    return {"items": [_serialize_movement(row) for row in rows], "total": total}


@router.post("/inventory/adjust")
def adjust_seller_inventory(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    try:
        product_id = int(payload.get("product_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="product_id is required")
    movement_type = (payload.get("movement_type") or "").strip().lower()
    if movement_type not in MOVEMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"movement_type must be one of: {', '.join(sorted(MOVEMENT_TYPES))}",
        )
    try:
        quantity = int(payload.get("quantity"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Quantity must be a whole number")
    if quantity == 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be zero")
    reason = (payload.get("reason") or "").strip() or None
    if movement_type in {"damage", "loss", "return"} and not reason:
        raise HTTPException(status_code=400, detail="A reason is required for this movement type")

    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.seller_id == current_user.id)
        .with_for_update()
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.status == "archived":
        raise HTTPException(status_code=400, detail="Archived products cannot receive stock changes")

    if movement_type == "receipt":
        if quantity < 0:
            raise HTTPException(status_code=400, detail="Receipt quantity must be positive")
        delta = quantity
    elif movement_type in {"damage", "loss"}:
        if quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        delta = -quantity
    elif movement_type == "return":
        if quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        delta = quantity
    else:  # adjustment / correction may be signed
        delta = quantity

    new_balance = int(product.stock or 0) + delta
    if new_balance < 0:
        raise HTTPException(status_code=400, detail="Adjustment would make stock negative")
    product.stock = new_balance
    db.add(product)
    movement = _record_movement(
        db,
        user=current_user,
        product=product,
        movement_type=movement_type,
        delta=delta,
        reason=reason,
        reference_type="manual",
    )
    record_audit(
        db,
        actor=current_user,
        entity_type="product",
        entity_id=product.id,
        action="seller.inventory.adjust",
        details={"movement_type": movement_type, "delta": delta, "balance_after": new_balance},
    )
    if new_balance <= int(product.low_stock_threshold or 5):
        _notification(
            db,
            current_user,
            background_tasks,
            title="Low stock warning",
            message=f"{product.name} has {new_balance} units remaining.",
            severity="warning",
            notification_type="inventory",
        )
    db.commit()
    db.refresh(product)
    return {
        "message": "Inventory updated",
        "movement": _serialize_movement(movement),
        "product": _serialize_product(product),
    }


# ---------------------------------------------------------------------------
# Orders and fulfilment
# ---------------------------------------------------------------------------


@router.get("/orders")
def list_seller_orders(
    status: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = _seller_sales_query(db, current_user)
    if status:
        query = query.filter(Sale.status == status)
    if date_from:
        query = query.filter(Sale.date >= date_from)
    if date_to:
        query = query.filter(Sale.date <= date_to)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(Sale.product.ilike(term), Sale.category.ilike(term), Sale.delivery_address.ilike(term))
        )
    total = query.count()
    orders = query.order_by(Sale.date.desc(), Sale.id.desc()).offset(offset).limit(limit).all()
    return {
        "items": _serialize_seller_rows(db, orders),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/orders/{sale_id}")
def get_seller_order(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sale = _sale_or_404(db, current_user, sale_id)
    detail = _serialize_seller_rows(db, [sale])[0]
    items = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id == sale.order_id,
            or_(OrderItem.seller_id == current_user.id, OrderItem.legacy_sale_id == sale.id),
        )
        .all()
        if sale.order_id
        else []
    )
    detail["items"] = [
        {
            "id": item.id,
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_price": _money(item.unit_price),
            "total_amount": _money(item.total_amount),
            "status": item.status,
        }
        for item in items
    ]
    from backend.services.orders.order_runtime import linked_order
    from backend.shared.models import OrderStatusHistory

    order = linked_order(db, sale)
    history = (
        db.query(OrderStatusHistory)
        .filter(OrderStatusHistory.order_id == order.id)
        .order_by(OrderStatusHistory.id.desc())
        .limit(30)
        .all()
        if order
        else []
    )
    detail["status_history"] = [
        {
            "status": entry.status,
            "reason": entry.reason,
            "actor_type": entry.actor_type,
            "created_at": _iso(entry.created_at),
        }
        for entry in history
    ]
    thread = db.query(ConversationThread).filter(
        or_(ConversationThread.sale_id == sale.id, ConversationThread.order_id == sale.order_id)
    ).first()
    detail["thread_id"] = thread.id if thread else None
    return {"order": detail}


@router.patch("/orders/{sale_id}/decision")
def seller_order_decision(
    sale_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    _sale_or_404(db, current_user, sale_id)
    return business_order_decision(sale_id, payload, background_tasks, db, current_user)


@router.patch("/orders/{sale_id}/status")
def seller_order_status(
    sale_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    _sale_or_404(db, current_user, sale_id)
    return business_update_order_status(sale_id, payload, background_tasks, db, current_user)


@router.post("/orders/{sale_id}/assign-delivery")
def assign_seller_delivery(
    sale_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    _sale_or_404(db, current_user, sale_id)
    safe_payload = {key: value for key, value in payload.items() if key != "seller_id"}
    return business_assign_delivery(sale_id, safe_payload, background_tasks, db, current_user)


@router.get("/deliveries")
def list_seller_deliveries(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(DeliveryOrder).filter(DeliveryOrder.seller_id == current_user.id)
    if status:
        query = query.filter(DeliveryOrder.status == status)
    deliveries = query.order_by(DeliveryOrder.created_at.desc()).limit(200).all()
    logistics_ids = [delivery.logistics_id for delivery in deliveries if delivery.logistics_id]
    logistics = (
        db.query(LogisticsUser).filter(LogisticsUser.id.in_(logistics_ids)).all() if logistics_ids else []
    )
    logistics_map = {row.id: row for row in logistics}
    return {
        "items": [
            {
                "id": delivery.id,
                "order_id": delivery.order_id,
                "status": delivery.status,
                "logistics_id": delivery.logistics_id,
                "logistics_name": logistics_map[delivery.logistics_id].name
                if delivery.logistics_id in logistics_map
                else None,
                "logistics_phone": logistics_map[delivery.logistics_id].phone
                if delivery.logistics_id in logistics_map
                else None,
                "pickup_location": delivery.pickup_location,
                "delivery_location": delivery.delivery_location,
                "price": _money(delivery.price),
                "estimated_distance_km": delivery.estimated_distance_km,
                "special_instructions": delivery.special_instructions,
                "created_at": _iso(delivery.created_at),
                "picked_at": _iso(delivery.picked_at),
                "delivered_at": _iso(delivery.delivered_at),
                "failure_reason": delivery.failure_reason,
            }
            for delivery in deliveries
        ]
    }


@router.get("/deliveries/{delivery_id}")
def get_seller_delivery(
    delivery_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    delivery = _delivery_or_404(db, current_user, delivery_id)
    logistics = (
        db.query(LogisticsUser).filter(LogisticsUser.id == delivery.logistics_id).first()
        if delivery.logistics_id
        else None
    )
    return {
        "delivery": {
            "id": delivery.id,
            "order_id": delivery.order_id,
            "status": delivery.status,
            "logistics": _serialize_logistics(logistics),
            "pickup_location": delivery.pickup_location,
            "delivery_location": delivery.delivery_location,
            "pickup_phone": delivery.pickup_phone,
            "delivery_phone": delivery.delivery_phone,
            "price": _money(delivery.price),
            "special_instructions": delivery.special_instructions,
            "estimated_distance_km": delivery.estimated_distance_km,
            "last_location_name": delivery.last_location_name,
            "created_at": _iso(delivery.created_at),
            "accepted_at": _iso(delivery.accepted_at),
            "picked_at": _iso(delivery.picked_at),
            "delivered_at": _iso(delivery.delivered_at),
            "failure_reason": delivery.failure_reason,
        }
    }


def _serialize_logistics(logistics: LogisticsUser | None) -> dict | None:
    if not logistics:
        return None
    return {
        "id": logistics.id,
        "name": logistics.name,
        "phone": logistics.phone,
        "vehicle_type": logistics.vehicle_type,
        "plate_number": logistics.plate_number,
        "rating": getattr(logistics, "rating", None),
    }


@router.patch("/deliveries/{delivery_id}/instructions")
def update_seller_delivery(
    delivery_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    delivery = _delivery_or_404(db, current_user, delivery_id)
    if (delivery.status or "") in {"delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="Completed deliveries cannot be edited")
    delivery.special_instructions = (payload.get("special_instructions") or "").strip() or None
    if payload.get("pickup_location"):
        delivery.pickup_location = str(payload.get("pickup_location")).strip()
    if payload.get("delivery_location"):
        delivery.delivery_location = str(payload.get("delivery_location")).strip()
    db.add(delivery)
    record_audit(
        db,
        actor=current_user,
        entity_type="delivery",
        entity_id=delivery.id,
        action="seller.delivery.instructions",
    )
    db.commit()
    return {"message": "Delivery instructions updated"}


# ---------------------------------------------------------------------------
# RFQs and quotations
# ---------------------------------------------------------------------------


@router.get("/rfqs")
def list_seller_rfqs(
    status: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(RFQ)
    if status:
        query = query.filter(RFQ.status == status)
    else:
        query = query.filter(RFQ.status.in_(["New", "Quoted"]))
    if category:
        query = query.filter(RFQ.category == category)
    rfqs = query.order_by(RFQ.created_at.desc()).limit(100).all()
    rfq_ids = [rfq.id for rfq in rfqs]
    mine = (
        db.query(Quotation).filter(Quotation.seller_id == current_user.id, Quotation.rfq_id.in_(rfq_ids)).all()
        if rfq_ids
        else []
    )
    mine_map = {quotation.rfq_id: quotation for quotation in mine}
    counts = (
        db.query(Quotation.rfq_id, func.count(Quotation.id))
        .filter(Quotation.rfq_id.in_(rfq_ids), Quotation.status.in_(["submitted", "revised", "accepted"]))
        .group_by(Quotation.rfq_id)
        .all()
        if rfq_ids
        else []
    )
    count_map = {int(row[0]): int(row[1]) for row in counts}
    return {
        "items": [
            _serialize_rfq(rfq, mine_map.get(rfq.id), count_map.get(rfq.id, 0))
            for rfq in rfqs
        ]
    }


@router.get("/rfqs/{rfq_id}")
def get_seller_rfq(
    rfq_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    quotation = db.query(Quotation).filter(
        Quotation.rfq_id == rfq.id, Quotation.seller_id == current_user.id
    ).first()
    count = db.query(Quotation).filter(
        Quotation.rfq_id == rfq.id, Quotation.status.in_(["submitted", "revised", "accepted"])
    ).count()
    clarifications = (
        db.query(RFQClarification)
        .filter(
            RFQClarification.rfq_id == rfq.id,
            or_(RFQClarification.seller_id == current_user.id, RFQClarification.answer.isnot(None)),
        )
        .order_by(RFQClarification.created_at.asc())
        .all()
    )
    payload = _serialize_rfq(rfq, quotation, count)
    payload["clarifications"] = [
        {
            "id": row.id,
            "question": row.question,
            "answer": row.answer,
            "mine": row.seller_id == current_user.id,
            "answered_at": _iso(row.answered_at),
            "created_at": _iso(row.created_at),
        }
        for row in clarifications
    ]
    return {"rfq": payload}


@router.post("/rfqs/{rfq_id}/quotations", status_code=201)
def submit_quotation(
    rfq_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).with_for_update().first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    if (rfq.status or "") not in {"New", "Quoted"}:
        raise HTTPException(status_code=400, detail="This RFQ is no longer accepting quotations")
    deadline = rfq.deadline
    if deadline:
        deadline_cmp = deadline.replace(tzinfo=timezone.utc) if deadline.tzinfo is None else deadline
        if deadline_cmp < _now():
            raise HTTPException(status_code=400, detail="The RFQ deadline has passed")
    try:
        unit_price = float(payload.get("unit_price"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="unit_price is required")
    if unit_price <= 0:
        raise HTTPException(status_code=400, detail="unit_price must be greater than zero")
    lead_time = payload.get("lead_time_days")
    if lead_time not in (None, ""):
        try:
            lead_time = int(lead_time)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="lead_time_days must be a whole number")
        if lead_time < 0:
            raise HTTPException(status_code=400, detail="lead_time_days cannot be negative")
    else:
        lead_time = None
    valid_until = _parse_datetime(payload.get("valid_until"), "valid_until")
    if valid_until and valid_until <= _now():
        raise HTTPException(status_code=400, detail="valid_until must be in the future")

    total_price = _money(unit_price * int(rfq.quantity or 1))
    quotation = db.query(Quotation).filter(
        Quotation.rfq_id == rfq.id, Quotation.seller_id == current_user.id
    ).with_for_update().first()

    if quotation and quotation.status == "accepted":
        raise HTTPException(status_code=400, detail="Accepted quotations cannot be changed")
    if quotation and quotation.status in {"submitted", "revised", "withdrawn", "rejected", "expired"}:
        quotation.unit_price = unit_price
        quotation.total_price = total_price
        quotation.lead_time_days = lead_time
        quotation.valid_until = valid_until
        quotation.notes = (payload.get("notes") or "").strip() or None
        quotation.version = int(quotation.version or 1) + 1
        quotation.status = "revised"
        quotation.withdrawn_at = None
        db.add(quotation)
        event_type = "revised"
    else:
        quotation = Quotation(
            rfq_id=rfq.id,
            seller_id=current_user.id,
            unit_price=unit_price,
            total_price=total_price,
            lead_time_days=lead_time,
            valid_until=valid_until,
            notes=(payload.get("notes") or "").strip() or None,
            status="submitted",
            version=1,
        )
        db.add(quotation)
        db.flush()
        event_type = "submitted"

    db.add(
        QuotationEvent(
            quotation_id=quotation.id,
            event_type=event_type,
            details_json=json.dumps({"unit_price": unit_price, "total_price": total_price}),
            actor_type="seller",
            actor_id=current_user.id,
        )
    )
    if (rfq.status or "") == "New":
        rfq.status = "Quoted"
        db.add(rfq)
    record_audit(
        db,
        actor=current_user,
        entity_type="quotation",
        entity_id=quotation.id,
        action=f"seller.quotation.{event_type}",
    )
    db.commit()
    db.refresh(quotation)
    return {"message": "Quotation submitted", "quotation": _serialize_quotation(quotation)}


@router.get("/quotations")
def list_seller_quotations(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(Quotation).filter(Quotation.seller_id == current_user.id)
    if status:
        query = query.filter(Quotation.status == status)
    quotations = query.order_by(Quotation.updated_at.desc(), Quotation.id.desc()).limit(200).all()
    rfq_ids = [quotation.rfq_id for quotation in quotations]
    rfqs = db.query(RFQ).filter(RFQ.id.in_(rfq_ids)).all() if rfq_ids else []
    rfq_map = {rfq.id: rfq for rfq in rfqs}
    return {
        "items": [
            {
                **_serialize_quotation(quotation),
                "rfq": _serialize_rfq(rfq_map[quotation.rfq_id]) if quotation.rfq_id in rfq_map else None,
            }
            for quotation in quotations
        ]
    }


@router.post("/quotations/{quotation_id}/withdraw")
def withdraw_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    quotation = (
        db.query(Quotation)
        .filter(Quotation.id == quotation_id, Quotation.seller_id == current_user.id)
        .with_for_update()
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if quotation.status not in {"submitted", "revised"}:
        raise HTTPException(status_code=400, detail="Only active quotations can be withdrawn")
    quotation.status = "withdrawn"
    quotation.withdrawn_at = _now()
    db.add(quotation)
    db.add(
        QuotationEvent(
            quotation_id=quotation.id,
            event_type="withdrawn",
            actor_type="seller",
            actor_id=current_user.id,
        )
    )
    record_audit(db, actor=current_user, entity_type="quotation", entity_id=quotation.id, action="seller.quotation.withdraw")
    db.commit()
    return {"message": "Quotation withdrawn", "quotation": _serialize_quotation(quotation)}


@router.post("/rfqs/{rfq_id}/clarifications", status_code=201)
def ask_rfq_clarification(
    rfq_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    question = (payload.get("question") or "").strip()
    if len(question) < 5:
        raise HTTPException(status_code=400, detail="Question is too short")
    clarification = RFQClarification(rfq_id=rfq.id, seller_id=current_user.id, question=question)
    db.add(clarification)
    record_audit(db, actor=current_user, entity_type="rfq", entity_id=rfq.id, action="seller.rfq.clarify")
    db.commit()
    db.refresh(clarification)
    return {
        "message": "Question submitted",
        "clarification": {"id": clarification.id, "question": clarification.question, "answer": None},
    }


# ---------------------------------------------------------------------------
# Customers and conversations
# ---------------------------------------------------------------------------


@router.get("/customers")
def list_seller_customers(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sales = _seller_sales_query(db, current_user).all()
    buyer_ids = sorted({int(sale.created_by) for sale in sales if sale.created_by is not None})
    buyers = db.query(User).filter(User.id.in_(buyer_ids)).all() if buyer_ids else []
    buyer_map = {buyer.id: buyer for buyer in buyers}
    paid_ids = _seller_completed_sale_ids(db, [sale.id for sale in sales])

    grouped: dict[int, dict] = {}
    for sale in sales:
        if sale.created_by is None:
            continue
        buyer_id = int(sale.created_by)
        row = grouped.setdefault(
            buyer_id,
            {
                "buyer_id": buyer_id,
                "name": buyer_map[buyer_id].name if buyer_id in buyer_map else f"Customer #{buyer_id}",
                "phone": buyer_map[buyer_id].phone if buyer_id in buyer_map else None,
                "email": buyer_map[buyer_id].email if buyer_id in buyer_map else None,
                "orders": 0,
                "completed_orders": 0,
                "total_spent": 0.0,
                "last_order_at": None,
                "ratings": [],
            },
        )
        row["orders"] += 1
        if (sale.status or "") in {"Received", "Delivered"}:
            row["completed_orders"] += 1
        if sale.id in paid_ids and (sale.status or "") != "Cancelled":
            row["total_spent"] += float((sale.quantity or 0) * (sale.unit_price or 0))
        order_date = sale.date.isoformat() if sale.date else None
        if order_date and (row["last_order_at"] is None or order_date > row["last_order_at"]):
            row["last_order_at"] = order_date
        if sale.rating:
            row["ratings"].append(int(sale.rating))

    items = []
    for row in grouped.values():
        ratings = row.pop("ratings")
        row["total_spent"] = _money(row["total_spent"])
        row["average_rating"] = round(sum(ratings) / len(ratings), 2) if ratings else None
        thread = db.query(ConversationThread).filter(ConversationThread.sale_id.in_(
            [sale.id for sale in sales if sale.created_by is not None and int(sale.created_by) == row["buyer_id"]]
        )).first()
        row["thread_id"] = thread.id if thread else None
        items.append(row)
    items.sort(key=lambda item: item["last_order_at"] or "", reverse=True)
    return {"items": items}


@router.get("/customers/{buyer_id}")
def get_seller_customer(
    buyer_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sales = (
        _seller_sales_query(db, current_user)
        .filter(Sale.created_by == buyer_id)
        .order_by(Sale.date.desc(), Sale.id.desc())
        .all()
    )
    if not sales:
        raise HTTPException(status_code=404, detail="Customer not found")
    buyer = db.query(User).filter(User.id == buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=404, detail="Customer not found")
    paid_ids = _seller_completed_sale_ids(db, [sale.id for sale in sales])
    return {
        "customer": {
            "buyer_id": buyer.id,
            "name": buyer.name,
            "phone": buyer.phone,
            "email": buyer.email,
            "address": buyer.address,
            "member_since": _iso(buyer.created_at),
            "orders": _serialize_seller_rows(db, sales),
            "total_spent": _money(
                sum(
                    float((sale.quantity or 0) * (sale.unit_price or 0))
                    for sale in sales
                    if sale.id in paid_ids and (sale.status or "") != "Cancelled"
                )
            ),
        }
    }


@router.get("/threads")
def list_seller_threads(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sale_ids = [row[0] for row in db.query(Sale.id).filter(Sale.seller_id == current_user.id).all()]
    order_ids = [
        row[0]
        for row in db.query(Sale.order_id).filter(Sale.seller_id == current_user.id, Sale.order_id.isnot(None)).all()
    ]
    conditions = []
    if sale_ids:
        conditions.append(ConversationThread.sale_id.in_(sale_ids))
    if order_ids:
        conditions.append(ConversationThread.order_id.in_(order_ids))
    threads = db.query(ConversationThread).filter(or_(*conditions)).order_by(
        ConversationThread.last_message_at.desc().nullslast(), ConversationThread.id.desc()
    ).limit(100).all() if conditions else []
    sale_id_by_sale = {row[0]: row[1] for row in db.query(Sale.id, Sale.created_by).filter(Sale.id.in_(sale_ids)).all()} if sale_ids else {}
    items = []
    for thread in threads:
        last_message = (
            db.query(ConversationMessage)
            .filter(ConversationMessage.thread_id == thread.id)
            .order_by(ConversationMessage.id.desc())
            .first()
        )
        items.append(
            {
                "id": thread.id,
                "sale_id": thread.sale_id,
                "order_id": thread.order_id,
                "subject": thread.subject,
                "buyer_id": sale_id_by_sale.get(thread.sale_id),
                "last_message": last_message.text if last_message else None,
                "last_message_at": _iso(thread.last_message_at or (last_message.created_at if last_message else None)),
            }
        )
    return {"items": items}


@router.get("/threads/{thread_id}/messages")
def get_seller_thread_messages(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    thread = _thread_or_404(db, current_user, thread_id)
    messages = list_thread_messages(db, thread_id=thread.id, limit=100)
    return {
        "thread": {"id": thread.id, "sale_id": thread.sale_id, "order_id": thread.order_id, "subject": thread.subject},
        "items": [
            serialize_conversation_message(message, current_type="business", current_id=current_user.id)
            for message in messages
        ],
    }


@router.post("/threads/{thread_id}/messages", status_code=201)
def send_seller_thread_message(
    thread_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    thread = _thread_or_404(db, current_user, thread_id)
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Message is too long")
    message = create_conversation_message(
        db,
        thread=thread,
        sender=current_user,
        text=text,
        client_id=(payload.get("client_id") or "").strip() or None,
    )
    db.commit()
    db.refresh(message)
    return {
        "message": serialize_conversation_message(message, current_type="business", current_id=current_user.id)
    }


# ---------------------------------------------------------------------------
# Reviews and reputation
# ---------------------------------------------------------------------------


@router.get("/reviews")
def list_seller_reviews(
    rating: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = _seller_sales_query(db, current_user).filter(Sale.rating.isnot(None))
    if rating:
        query = query.filter(Sale.rating == rating)
    sales = query.order_by(Sale.rated_at.desc(), Sale.id.desc()).limit(limit).all()
    sale_ids = [sale.id for sale in sales]
    replies = db.query(ReviewReply).filter(ReviewReply.sale_id.in_(sale_ids)).all() if sale_ids else []
    reports = db.query(ReviewReport).filter(ReviewReport.sale_id.in_(sale_ids)).all() if sale_ids else []
    reply_map = {reply.sale_id: reply for reply in replies}
    report_map: dict[int, list[ReviewReport]] = {}
    for report in reports:
        report_map.setdefault(report.sale_id, []).append(report)
    all_ratings = [int(row[0]) for row in db.query(Sale.rating).filter(
        Sale.seller_id == current_user.id, Sale.rating.isnot(None)
    ).all()]
    distribution = {str(star): all_ratings.count(star) for star in range(1, 6)}
    return {
        "summary": {
            "average_rating": round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else None,
            "total_reviews": len(all_ratings),
            "distribution": distribution,
        },
        "items": [
            _serialize_review(sale, reply_map.get(sale.id), report_map.get(sale.id, []))
            for sale in sales
        ],
    }


@router.post("/reviews/{sale_id}/reply")
def reply_to_seller_review(
    sale_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sale = _sale_or_404(db, current_user, sale_id)
    if not sale.rating:
        raise HTTPException(status_code=400, detail="This order has no customer review")
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Reply cannot be empty")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Reply is too long")
    reply = db.query(ReviewReply).filter(ReviewReply.sale_id == sale.id).first()
    if reply:
        reply.message = message
        reply.seller_id = current_user.id
    else:
        reply = ReviewReply(sale_id=sale.id, seller_id=current_user.id, message=message)
    db.add(reply)
    record_audit(db, actor=current_user, entity_type="sale", entity_id=sale.id, action="seller.review.reply")
    db.commit()
    db.refresh(reply)
    return {"message": "Reply published", "reply": _serialize_review(sale, reply, [])["reply"]}


@router.post("/reviews/{sale_id}/report")
def report_seller_review(
    sale_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sale = _sale_or_404(db, current_user, sale_id)
    if not sale.rating:
        raise HTTPException(status_code=400, detail="This order has no customer review")
    reason = (payload.get("reason") or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Please describe the problem in at least 10 characters")
    existing = (
        db.query(ReviewReport)
        .filter(ReviewReport.sale_id == sale.id, ReviewReport.status == "open")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="A report is already open for this review")
    report = ReviewReport(sale_id=sale.id, seller_id=current_user.id, reason=reason, status="open")
    db.add(report)
    record_audit(db, actor=current_user, entity_type="sale", entity_id=sale.id, action="seller.review.report")
    db.commit()
    db.refresh(report)
    return {"message": "Review reported for moderation", "report_id": report.id}


# ---------------------------------------------------------------------------
# Promotions
# ---------------------------------------------------------------------------


@router.get("/promotions")
def list_seller_promotions(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    promotions = (
        db.query(Promotion)
        .filter(Promotion.seller_id == current_user.id)
        .order_by(Promotion.id.desc())
        .limit(200)
        .all()
    )
    product_ids = [promotion.product_id for promotion in promotions]
    products = db.query(Product).filter(Product.id.in_(product_ids)).all() if product_ids else []
    product_map = {product.id: product for product in products}
    return {"items": [_serialize_promotion(row, product_map.get(row.product_id)) for row in promotions]}


@router.post("/promotions", status_code=201)
def create_seller_promotion(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    try:
        product_id = int(payload.get("product_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="product_id is required")
    product = _product_or_404(db, current_user, product_id)
    if product.status != "approved" or not product.is_active:
        raise HTTPException(status_code=400, detail="Only active, approved products can be promoted")
    name = (payload.get("name") or "").strip()
    if len(name) < 3:
        raise HTTPException(status_code=400, detail="Promotion name is required")
    discount_type = (payload.get("discount_type") or "percent").strip().lower()
    if discount_type not in {"percent", "fixed"}:
        raise HTTPException(status_code=400, detail="discount_type must be percent or fixed")
    try:
        discount_value = float(payload.get("discount_value"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="discount_value is required")
    if discount_value <= 0:
        raise HTTPException(status_code=400, detail="Discount must be greater than zero")
    if discount_type == "percent" and discount_value > 90:
        raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 90%")
    if discount_type == "fixed" and discount_value >= float(product.price or 0):
        raise HTTPException(status_code=400, detail="Fixed discount must be less than the product price")
    starts_at = _parse_datetime(payload.get("starts_at"), "starts_at") or _now()
    ends_at = _parse_datetime(payload.get("ends_at"), "ends_at")
    if not ends_at or ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Promotion end must be after the start")
    if ends_at - starts_at > timedelta(days=90):
        raise HTTPException(status_code=400, detail="Promotions cannot run longer than 90 days")

    promotion = Promotion(
        seller_id=current_user.id,
        product_id=product.id,
        name=name,
        discount_type=discount_type,
        discount_value=discount_value,
        starts_at=starts_at,
        ends_at=ends_at,
        status="scheduled" if starts_at > _now() else "active",
    )
    db.add(promotion)
    record_audit(db, actor=current_user, entity_type="promotion", entity_id=None, action="seller.promotion.create")
    db.commit()
    db.refresh(promotion)
    return {"message": "Promotion created", "promotion": _serialize_promotion(promotion, product)}


@router.patch("/promotions/{promotion_id}")
def update_seller_promotion(
    promotion_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    promotion = (
        db.query(Promotion)
        .filter(Promotion.id == promotion_id, Promotion.seller_id == current_user.id)
        .first()
    )
    if not promotion:
        raise HTTPException(status_code=404, detail="Promotion not found")
    if promotion.status == "rejected":
        raise HTTPException(status_code=400, detail="Rejected promotions cannot be edited")
    action = (payload.get("action") or "").strip().lower()
    if action:
        if action not in {"pause", "resume", "cancel"}:
            raise HTTPException(status_code=400, detail="Unknown promotion action")
        if action == "pause":
            if promotion.status != "active":
                raise HTTPException(status_code=400, detail="Only active promotions can be paused")
            promotion.status = "paused"
        elif action == "resume":
            if promotion.status != "paused":
                raise HTTPException(status_code=400, detail="Only paused promotions can be resumed")
            ends_at = promotion.ends_at
            ends_cmp = ends_at.replace(tzinfo=timezone.utc) if ends_at and ends_at.tzinfo is None else ends_at
            if ends_cmp and ends_cmp <= _now():
                raise HTTPException(status_code=400, detail="This promotion has expired")
            promotion.status = "active"
        else:
            promotion.status = "expired"
    else:
        if "name" in payload:
            name = (payload.get("name") or "").strip()
            if len(name) < 3:
                raise HTTPException(status_code=400, detail="Promotion name is required")
            promotion.name = name
        if "starts_at" in payload:
            promotion.starts_at = _parse_datetime(payload.get("starts_at"), "starts_at")
        if "ends_at" in payload:
            promotion.ends_at = _parse_datetime(payload.get("ends_at"), "ends_at")
        if promotion.ends_at and promotion.starts_at and promotion.ends_at <= promotion.starts_at:
            raise HTTPException(status_code=400, detail="Promotion end must be after the start")
        if promotion.ends_at and promotion.ends_at - promotion.starts_at > timedelta(days=90):
            raise HTTPException(status_code=400, detail="Promotions cannot run longer than 90 days")
    db.add(promotion)
    record_audit(
        db,
        actor=current_user,
        entity_type="promotion",
        entity_id=promotion.id,
        action=f"seller.promotion.{action or 'update'}",
    )
    db.commit()
    product = db.query(Product).filter(Product.id == promotion.product_id).first()
    return {"message": "Promotion updated", "promotion": _serialize_promotion(promotion, product)}


# ---------------------------------------------------------------------------
# Analytics and exports
# ---------------------------------------------------------------------------


@router.get("/analytics")
def seller_analytics(
    range_days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    start = date.today() - timedelta(days=range_days - 1)
    sales = (
        _seller_sales_query(db, current_user)
        .filter(Sale.date >= start)
        .order_by(Sale.date.asc(), Sale.id.asc())
        .all()
    )
    paid_ids = _seller_completed_sale_ids(db, [sale.id for sale in sales])
    timeline: dict[str, dict] = {}
    for sale in sales:
        key = sale.date.isoformat() if sale.date else "unknown"
        row = timeline.setdefault(key, {"date": key, "orders": 0, "units": 0, "revenue": 0.0})
        row["orders"] += 1
        row["units"] += int(sale.quantity or 0)
        if sale.id in paid_ids and (sale.status or "") != "Cancelled":
            row["revenue"] += float((sale.quantity or 0) * (sale.unit_price or 0))

    product_rows: dict[str, dict] = {}
    for sale in sales:
        key = sale.product or "Unspecified"
        row = product_rows.setdefault(key, {"product": key, "orders": 0, "units": 0, "revenue": 0.0})
        row["orders"] += 1
        row["units"] += int(sale.quantity or 0)
        if sale.id in paid_ids and (sale.status or "") != "Cancelled":
            row["revenue"] += float((sale.quantity or 0) * (sale.unit_price or 0))
    top_products = sorted(product_rows.values(), key=lambda row: row["revenue"], reverse=True)[:8]
    for row in top_products:
        row["revenue"] = _money(row["revenue"])
    slow_movers = sorted(
        [row for row in product_rows.values() if row["units"] <= 1],
        key=lambda row: row["units"],
    )[:8]

    total_orders = len(sales)
    cancelled = len([sale for sale in sales if (sale.status or "") == "Cancelled"])
    fulfilled = len([sale for sale in sales if (sale.status or "") in {"Received", "Delivered"}])
    revenue = _money(sum(row["revenue"] for row in timeline.values()))
    paid_orders = len([sale for sale in sales if sale.id in paid_ids and (sale.status or "") != "Cancelled"])
    ratings = [int(sale.rating) for sale in sales if sale.rating]

    previous_customers = {
        row[0]
        for row in db.query(Sale.created_by)
        .filter(Sale.seller_id == current_user.id, Sale.date < start, Sale.created_by.isnot(None))
        .distinct()
        .all()
    }
    period_customers = {sale.created_by for sale in sales if sale.created_by is not None}
    new_customers = len(period_customers - previous_customers)

    quotation_activity = (
        db.query(Quotation.status, func.count(Quotation.id))
        .filter(Quotation.seller_id == current_user.id, Quotation.created_at >= datetime.combine(start, datetime.min.time()))
        .group_by(Quotation.status)
        .all()
    )
    quotation_counts = {str(row[0]): int(row[1]) for row in quotation_activity}

    return {
        "range_days": range_days,
        "summary": {
            "revenue": revenue,
            "orders": total_orders,
            "paid_orders": paid_orders,
            "cancelled_orders": cancelled,
            "average_order_value": _money(revenue / paid_orders) if paid_orders else 0.0,
            "fulfilment_rate": round(fulfilled / total_orders * 100, 2) if total_orders else 0.0,
            "cancellation_rate": round(cancelled / total_orders * 100, 2) if total_orders else 0.0,
            "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "new_customers": new_customers,
            "returning_customers": max(0, len(period_customers) - new_customers),
        },
        "revenue_timeline": [
            {**row, "revenue": _money(row["revenue"])}
            for _, row in sorted(timeline.items())
        ],
        "top_products": top_products,
        "slow_moving_products": slow_movers,
        "quotation_activity": {
            "submitted": quotation_counts.get("submitted", 0) + quotation_counts.get("revised", 0),
            "accepted": quotation_counts.get("accepted", 0),
            "withdrawn": quotation_counts.get("withdrawn", 0),
        },
        "notes": [
            "Revenue only includes settled customer payments and excludes delivery fees.",
            "Refunds are only counted when a paid order has been cancelled and are shown as pending refunds until the payment provider confirms settlement.",
        ],
    }


@router.get("/analytics/export")
def export_seller_analytics(
    export_type: str = Query(default="sales", alias="type"),
    range_days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    if export_type not in {"sales", "inventory", "finance"}:
        raise HTTPException(status_code=400, detail="type must be sales, inventory or finance")
    start = date.today() - timedelta(days=range_days - 1)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    if export_type == "sales":
        writer.writerow(["sale_id", "date", "product", "category", "quantity", "unit_price", "total", "status"])
        rows = (
            _seller_sales_query(db, current_user)
            .filter(Sale.date >= start)
            .order_by(Sale.date.asc(), Sale.id.asc())
            .all()
        )
        for sale in rows:
            writer.writerow([
                sale.id,
                sale.date.isoformat() if sale.date else "",
                sale.product or "",
                sale.category or "",
                int(sale.quantity or 0),
                _money(sale.unit_price),
                _money(float((sale.quantity or 0) * (sale.unit_price or 0))),
                sale.status or "",
            ])
    elif export_type == "inventory":
        writer.writerow(["product_id", "name", "category", "status", "stock", "low_stock_threshold", "unit_price", "stock_value"])
        products = db.query(Product).filter(Product.seller_id == current_user.id).order_by(Product.id.asc()).all()
        for product in products:
            writer.writerow([
                product.id,
                product.name,
                product.category,
                product.status or "",
                int(product.stock or 0),
                int(product.low_stock_threshold or 5),
                _money(product.price),
                _money(float(product.stock or 0) * float(product.price or 0)),
            ])
    else:
        writer.writerow(["transaction_id", "sale_id", "amount", "status", "method", "created_at", "confirmed_at"])
        sale_ids = [row[0] for row in db.query(Sale.id).filter(Sale.seller_id == current_user.id).all()]
        payments = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.order_id.in_(sale_ids))
            .order_by(PaymentTransaction.created_at.asc())
            .all()
            if sale_ids
            else []
        )
        for payment in payments:
            writer.writerow([
                payment.transaction_id,
                payment.order_id,
                _money(payment.amount),
                payment.status,
                payment.payment_method,
                _iso(payment.created_at) or "",
                _iso(payment.confirmed_at) or "",
            ])
    buffer.seek(0)
    record_audit(
        db,
        actor=current_user,
        entity_type="analytics_export",
        entity_id=current_user.id,
        action=f"seller.export.{export_type}",
    )
    db.commit()
    filename = f"seller-{export_type}-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Finance and payouts
# ---------------------------------------------------------------------------


@router.get("/finance/overview")
def seller_finance_overview(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    account = db.query(SellerPayoutAccount).filter(SellerPayoutAccount.seller_id == current_user.id).first()
    payouts = (
        db.query(SellerPayout)
        .filter(SellerPayout.seller_id == current_user.id)
        .order_by(SellerPayout.id.desc())
        .limit(20)
        .all()
    )
    snapshot = _finance_snapshot(db, current_user, date_from, date_to)
    snapshot["payout_account"] = _serialize_account(account)
    snapshot["minimum_payout_amount"] = MIN_PAYOUT_AMOUNT
    snapshot["recent_payouts"] = [_serialize_payout(row) for row in payouts[:8]]
    snapshot["can_request_payout"] = bool(
        account
        and account.status == "verified"
        and snapshot["available_for_payout"] >= MIN_PAYOUT_AMOUNT
    )
    return snapshot


@router.get("/finance/transactions")
def seller_finance_transactions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    sale_ids = [row[0] for row in db.query(Sale.id).filter(Sale.seller_id == current_user.id).all()]
    if not sale_ids:
        return {"items": [], "total": 0}
    query = db.query(PaymentTransaction).filter(PaymentTransaction.order_id.in_(sale_ids))
    total = query.count()
    rows = query.order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc()).offset(offset).limit(limit).all()
    sales = db.query(Sale).filter(Sale.id.in_([row.order_id for row in rows])).all()
    sale_map = {sale.id: sale for sale in sales}
    return {
        "items": [
            {
                "transaction_id": row.transaction_id,
                "sale_id": row.order_id,
                "product": sale_map[row.order_id].product if row.order_id in sale_map else None,
                "amount": _money(row.amount),
                "status": row.status,
                "payment_method": row.payment_method,
                "created_at": _iso(row.created_at),
                "confirmed_at": _iso(row.confirmed_at),
            }
            for row in rows
        ],
        "total": total,
    }


@router.get("/payout-account")
def get_payout_account(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    account = db.query(SellerPayoutAccount).filter(SellerPayoutAccount.seller_id == current_user.id).first()
    return {"account": _serialize_account(account)}


@router.put("/payout-account")
def upsert_payout_account(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    method = (payload.get("method") or "bank_transfer").strip().lower()
    if method not in {"bank_transfer", "mobile_money"}:
        raise HTTPException(status_code=400, detail="Unsupported payout method")
    account_name = (payload.get("account_name") or "").strip()
    account_number = (payload.get("account_number") or "").strip()
    if len(account_name) < 2:
        raise HTTPException(status_code=400, detail="Account name is required")
    digits = "".join(char for char in account_number if char.isalnum())
    if len(digits) < 6:
        raise HTTPException(status_code=400, detail="Enter a valid account number")
    bank_name = (payload.get("bank_name") or "").strip() or None
    if method == "bank_transfer" and not bank_name:
        raise HTTPException(status_code=400, detail="Bank name is required for bank transfers")

    masked = f"{'*' * max(0, len(digits) - 4)}{digits[-4:]}"
    details = {"bank_name": bank_name, "network": (payload.get("network") or "").strip() or None}
    account = db.query(SellerPayoutAccount).filter(SellerPayoutAccount.seller_id == current_user.id).first()
    if account:
        account.method = method
        account.account_name = account_name
        account.account_number_masked = masked
        account.details_json = json.dumps({key: value for key, value in details.items() if value})
        account.status = "pending"
        account.rejection_reason = None
        account.verified_by = None
        account.verified_at = None
    else:
        account = SellerPayoutAccount(
            seller_id=current_user.id,
            method=method,
            account_name=account_name,
            account_number_masked=masked,
            details_json=json.dumps({key: value for key, value in details.items() if value}),
            status="pending",
        )
        db.add(account)
    record_audit(db, actor=current_user, entity_type="payout_account", entity_id=account.id, action="seller.payout_account.update")
    db.commit()
    db.refresh(account)
    return {"message": "Payout account saved and sent for verification", "account": _serialize_account(account)}


@router.get("/payouts")
def list_seller_payouts(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    payouts = (
        db.query(SellerPayout)
        .filter(SellerPayout.seller_id == current_user.id)
        .order_by(SellerPayout.id.desc())
        .limit(100)
        .all()
    )
    return {"items": [_serialize_payout(row) for row in payouts]}


@router.post("/payouts", status_code=201)
def request_seller_payout(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    idempotency_key = (payload.get("idempotency_key") or "").strip() or None
    if idempotency_key:
        existing = db.query(SellerPayout).filter(
            SellerPayout.seller_id == current_user.id,
            SellerPayout.idempotency_key == idempotency_key,
        ).first()
        if existing:
            return {"message": "Payout request already recorded", "payout": _serialize_payout(existing)}
    try:
        amount = float(payload.get("amount"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount is required")
    if amount < MIN_PAYOUT_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Minimum payout is {MIN_PAYOUT_AMOUNT:.2f}")

    account = db.query(SellerPayoutAccount).filter(SellerPayoutAccount.seller_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=400, detail="Add a payout account before requesting a payout")
    if account.status != "verified":
        raise HTTPException(status_code=400, detail="Payout account must be verified before requesting a payout")

    db.query(SellerPayout).filter(
        SellerPayout.seller_id == current_user.id,
        SellerPayout.status.in_(["requested", "approved", "processing", "completed"]),
    ).with_for_update().all()
    snapshot = _finance_snapshot(db, current_user)
    if amount > snapshot["available_for_payout"]:
        raise HTTPException(status_code=400, detail="Payout amount exceeds available balance")

    payout = SellerPayout(
        seller_id=current_user.id,
        amount=_money(amount),
        status="requested",
        method=account.method,
        destination_label=f"{account.account_name} · {account.account_number_masked}",
        reference=f"PAY-{secrets.token_hex(5).upper()}",
        idempotency_key=idempotency_key,
        note=(payload.get("note") or "").strip() or None,
    )
    db.add(payout)
    _notification(
        db,
        current_user,
        background_tasks,
        title="Payout requested",
        message=f"Your payout request for {amount:.2f} is awaiting review.",
        notification_type="finance",
    )
    record_audit(db, actor=current_user, entity_type="payout", entity_id=None, action="seller.payout.request")
    db.commit()
    db.refresh(payout)
    return {"message": "Payout request submitted", "payout": _serialize_payout(payout)}


# ---------------------------------------------------------------------------
# Disputes
# ---------------------------------------------------------------------------


@router.get("/disputes")
def list_seller_disputes(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    query = db.query(Dispute).filter(Dispute.seller_id == current_user.id)
    if status:
        query = query.filter(Dispute.status == status)
    disputes = query.order_by(Dispute.id.desc()).limit(100).all()
    sale_ids = [dispute.sale_id for dispute in disputes]
    sales = db.query(Sale).filter(Sale.id.in_(sale_ids)).all() if sale_ids else []
    sale_map = {sale.id: sale for sale in sales}
    response = []
    for dispute in disputes:
        message_count = db.query(DisputeMessage).filter(DisputeMessage.dispute_id == dispute.id).count()
        response.append(
            {
                "id": dispute.id,
                "sale_id": dispute.sale_id,
                "product": sale_map[dispute.sale_id].product if dispute.sale_id in sale_map else None,
                "buyer_id": dispute.buyer_id,
                "status": dispute.status,
                "resolution_details": dispute.resolution_details,
                "message_count": message_count,
                "created_at": _iso(dispute.created_at),
                "resolved_at": _iso(dispute.resolved_at),
            }
        )
    return {"items": response}


@router.get("/disputes/{dispute_id}")
def get_seller_dispute(
    dispute_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    dispute = _dispute_or_404(db, current_user, dispute_id)
    sale = db.query(Sale).filter(Sale.id == dispute.sale_id).first()
    buyer = db.query(User).filter(User.id == dispute.buyer_id).first()
    messages = (
        db.query(DisputeMessage)
        .filter(DisputeMessage.dispute_id == dispute.id, DisputeMessage.is_internal == False)  # noqa: E712
        .order_by(DisputeMessage.id.asc())
        .all()
    )
    return {
        "dispute": {
            "id": dispute.id,
            "sale_id": dispute.sale_id,
            "status": dispute.status,
            "resolution_details": dispute.resolution_details,
            "buyer": {"id": buyer.id, "name": buyer.name, "phone": buyer.phone} if buyer else None,
            "sale": {
                "id": sale.id,
                "product": sale.product,
                "quantity": sale.quantity,
                "unit_price": _money(sale.unit_price),
                "status": sale.status,
            }
            if sale
            else None,
            "created_at": _iso(dispute.created_at),
            "resolved_at": _iso(dispute.resolved_at),
            "messages": [
                {
                    "id": message.id,
                    "sender_type": message.sender_type,
                    "sender_id": message.sender_id,
                    "message": message.message,
                    "evidence_url": message.evidence_url,
                    "created_at": _iso(message.created_at),
                }
                for message in messages
            ],
        }
    }


@router.post("/disputes", status_code=201)
def open_seller_dispute(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    try:
        sale_id = int(payload.get("sale_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="sale_id is required")
    sale = _sale_or_404(db, current_user, sale_id)
    if not sale.created_by:
        raise HTTPException(status_code=400, detail="This order has no customer to dispute with")
    existing = (
        db.query(Dispute)
        .filter(Dispute.sale_id == sale.id, Dispute.status == "open")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="An open dispute already exists for this order")
    reason = (payload.get("reason") or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Describe the issue in at least 10 characters")
    delivery = db.query(DeliveryOrder).filter(DeliveryOrder.order_id == sale.id).first()
    dispute = Dispute(
        sale_id=sale.id,
        buyer_id=int(sale.created_by),
        seller_id=current_user.id,
        logistics_id=delivery.logistics_id if delivery else None,
        status="open",
    )
    db.add(dispute)
    db.flush()
    db.add(
        DisputeMessage(
            dispute_id=dispute.id,
            sender_type="seller",
            sender_id=current_user.id,
            message=reason,
            evidence_url=(payload.get("evidence_url") or "").strip() or None,
        )
    )
    buyer = db.query(User).filter(User.id == int(sale.created_by)).first()
    if buyer:
        buyer_type, buyer_id, buyer_email, buyer_name = resolve_subject(buyer)
        create_notification(
            db,
            recipient_type=buyer_type,
            recipient_id=buyer_id,
            recipient_email=buyer_email,
            title="A dispute was opened",
            message=f"{current_user.business_name} opened a dispute for order #{sale.id}.",
            notification_type="dispute",
            severity="warning",
            action_href="/app/orders",
            send_email=bool(buyer_email),
            email_subject="Dispute opened for your order",
            email_body=f"Hello {buyer_name},\n\n{current_user.business_name} opened a dispute for order #{sale.id}.\n\nSokoLnk",
            background_tasks=background_tasks,
        )
    record_audit(db, actor=current_user, entity_type="dispute", entity_id=dispute.id, action="seller.dispute.open")
    db.commit()
    return {"message": "Dispute opened", "dispute_id": dispute.id}


@router.post("/disputes/{dispute_id}/messages", status_code=201)
def add_seller_dispute_message(
    dispute_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    dispute = _dispute_or_404(db, current_user, dispute_id)
    if dispute.status != "open":
        raise HTTPException(status_code=400, detail="This dispute is already resolved")
    message_text = (payload.get("message") or "").strip() or None
    evidence_url = (payload.get("evidence_url") or "").strip() or None
    if not message_text and not evidence_url:
        raise HTTPException(status_code=400, detail="Add a message or evidence link")
    if message_text and len(message_text) > 4000:
        raise HTTPException(status_code=400, detail="Message is too long")
    message = DisputeMessage(
        dispute_id=dispute.id,
        sender_type="seller",
        sender_id=current_user.id,
        message=message_text,
        evidence_url=evidence_url,
    )
    db.add(message)
    record_audit(db, actor=current_user, entity_type="dispute", entity_id=dispute.id, action="seller.dispute.message")
    db.commit()
    db.refresh(message)
    return {
        "message": "Response added",
        "entry": {
            "id": message.id,
            "message": message.message,
            "evidence_url": message.evidence_url,
            "created_at": _iso(message.created_at),
        },
    }


# ---------------------------------------------------------------------------
# Settings and account security
# ---------------------------------------------------------------------------


@router.get("/settings")
def seller_settings(
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    account = db.query(SellerPayoutAccount).filter(SellerPayoutAccount.seller_id == current_user.id).first()
    sessions = _seller_sessions(db, current_user)
    return {
        "business": _serialize_business(current_user),
        "payout_account": _serialize_account(account),
        "security": {
            "mfa_status": "not_configured",
            "password_changed_supported": True,
            "session_management_supported": True,
            "note": "Multi-factor authentication is not available in the current platform release.",
        },
        "sessions": sessions,
        "verification": {
            "status": current_user.verification_status,
            "documents": _verification_documents(db, current_user),
        },
    }


def _seller_sessions(db: Session, user: BusinessUser) -> list[dict]:
    if not user.identity_id:
        return []
    rows = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.identity_id == user.identity_id,
            RefreshToken.user_type == "business",
            RefreshToken.is_revoked == False,  # noqa: E712
            RefreshToken.expires_at > _now(),
        )
        .order_by(RefreshToken.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": row.id,
            "active_role": row.active_role,
            "created_at": _iso(row.created_at),
            "expires_at": _iso(row.expires_at),
        }
        for row in rows
    ]


def _verification_documents(db: Session, user: BusinessUser) -> list[dict]:
    rows = (
        db.query(BusinessVerification)
        .filter(BusinessVerification.business_id == user.id)
        .order_by(BusinessVerification.id.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "id": row.id,
            "document_type": row.document_type,
            "status": row.status,
            "submitted_at": _iso(row.submitted_at),
            "reviewed_at": _iso(row.reviewed_at),
        }
        for row in rows
    ]


@router.post("/settings/password")
def change_seller_password(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if current_password == new_password:
        raise HTTPException(status_code=400, detail="New password must be different")
    current_user.password_hash = hash_password(new_password)
    db.add(current_user)
    if current_user.identity_id:
        db.query(RefreshToken).filter(
            RefreshToken.identity_id == current_user.identity_id,
            RefreshToken.is_revoked == False,  # noqa: E712
        ).update({"is_revoked": True, "revoked_at": _now()}, synchronize_session=False)
    _notification(
        db,
        current_user,
        background_tasks,
        title="Password changed",
        message="Your seller password was changed and all other sessions were signed out.",
        notification_type="security",
        severity="success",
    )
    record_audit(db, actor=current_user, entity_type="business_user", entity_id=current_user.id, action="seller.password.change")
    db.commit()
    return {"message": "Password updated. Please sign in again on other devices."}


@router.delete("/settings/sessions/{session_id}")
def revoke_seller_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    if not current_user.identity_id:
        raise HTTPException(status_code=404, detail="Session not found")
    session = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.id == session_id,
            RefreshToken.identity_id == current_user.identity_id,
            RefreshToken.user_type == "business",
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_revoked = True
    session.revoked_at = _now()
    db.add(session)
    record_audit(db, actor=current_user, entity_type="refresh_token", entity_id=session.id, action="seller.session.revoke")
    db.commit()
    return {"message": "Session revoked"}


@router.post("/settings/sessions/revoke-all")
def revoke_all_seller_sessions(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: BusinessUser = Depends(get_current_business_user),
):
    if not current_user.identity_id:
        return {"message": "No sessions to revoke", "revoked": 0}
    keep_session_id = payload.get("keep_session_id")
    query = db.query(RefreshToken).filter(
        RefreshToken.identity_id == current_user.identity_id,
        RefreshToken.user_type == "business",
        RefreshToken.is_revoked == False,  # noqa: E712
    )
    if keep_session_id:
        try:
            query = query.filter(RefreshToken.id != int(keep_session_id))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid keep_session_id")
    revoked = query.update({"is_revoked": True, "revoked_at": _now()}, synchronize_session=False)
    record_audit(
        db,
        actor=current_user,
        entity_type="refresh_token",
        entity_id=current_user.identity_id,
        action="seller.session.revoke_all",
        details={"revoked": revoked},
    )
    db.commit()
    return {"message": "Other sessions revoked", "revoked": revoked}
