from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.services.identity.auth import require_roles
from backend.shared.schemas import RFQCreate
from backend.shared.database import get_db
from backend.shared.models import RFQ, User

router = APIRouter(prefix="/rfq", tags=["RFQ"])

ALLOWED_STATUSES = {"New", "Quoted", "Closed"}


def _normalize_status(value: str | None) -> str:
    status = (value or "").strip().title()
    if status in ALLOWED_STATUSES:
        return status
    return "New"


def _requested_status(value: str | None) -> str | None:
    status = (value or "").strip().title()
    if status in ALLOWED_STATUSES:
        return status
    return None


def _serialize(rfq: RFQ) -> dict:
    return {
        "id": rfq.id,
        "company_name": rfq.company_name,
        "contact_name": rfq.contact_name,
        "email": rfq.email,
        "phone": rfq.phone,
        "product_interest": rfq.product_interest,
        "quantity": rfq.quantity,
        "target_budget": rfq.target_budget,
        "notes": rfq.notes,
        "status": rfq.status,
        "created_at": rfq.created_at.isoformat() if rfq.created_at else None,
    }


@router.post("/", status_code=201)
def create_rfq(
    payload: RFQCreate,
    db: Session = Depends(get_db),
):
    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    model = RFQ(
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name.strip(),
        email=payload.email.strip().lower(),
        phone=(payload.phone or "").strip() or None,
        product_interest=payload.product_interest.strip(),
        quantity=int(payload.quantity),
        target_budget=(payload.target_budget or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        status="New",
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return _serialize(model)


@router.get("/")
def list_rfqs(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    query = db.query(RFQ)
    if status:
        requested = _requested_status(status)
        if not requested:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(RFQ.status == requested)
    rows = query.order_by(RFQ.created_at.desc(), RFQ.id.desc()).all()
    return [_serialize(rfq) for rfq in rows]


@router.patch("/{rfq_id}/status")
def update_rfq_status(
    rfq_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    new_status = _requested_status(payload.get("status"))
    if not new_status:
        raise HTTPException(status_code=400, detail="Invalid status")

    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    rfq.status = new_status
    db.add(rfq)
    db.commit()
    db.refresh(rfq)
    return _serialize(rfq)
