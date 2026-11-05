from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.services.identity.auth import get_current_user, require_roles
from backend.shared.schemas import ProviderCreate
from backend.shared.database import get_db
from backend.shared.models import Provider, Product, Sale, User

router = APIRouter(prefix="/providers", tags=["Providers"])


def _serialize(provider: Provider) -> dict:
    created = getattr(provider, 'created_at', None)
    return {
        "id": provider.id,
        "name": provider.name,
        "location": provider.location,
        "email": provider.email,
        "phone": provider.phone,
        "verified": provider.verified,
        "response_time": provider.response_time,
        "min_order_qty": provider.min_order_qty,
        "created_at": created.isoformat() if created else None,
    }


def _serialize_full(provider: Provider, product_count: int = 0, total_sales: int = 0, rating_count: int = 0) -> dict:
    created = getattr(provider, 'created_at', None)
    return {
        "id": provider.id,
        "name": provider.name,
        "location": provider.location,
        "email": provider.email,
        "phone": provider.phone,
        "verified": provider.verified,
        "response_time": provider.response_time,
        "min_order_qty": provider.min_order_qty,
        "description": getattr(provider, 'description', None),
        "rating_avg": getattr(provider, 'rating_avg', 0) or 0,
        "rating_count": rating_count,
        "total_sales": total_sales,
        "total_products": product_count,
        "created_at": created.isoformat() if created else None,
    }


@router.get("/")
def list_providers(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(Provider).order_by(Provider.name.asc()).all()
    return [_serialize(p) for p in rows]


@router.get("/public")
def list_public_providers(
    db: Session = Depends(get_db),
):
    rows = db.query(Provider).order_by(Provider.verified.desc(), Provider.name.asc()).limit(12).all()
    return [_serialize(p) for p in rows]


@router.get("/{provider_id}")
def get_provider_profile(
    provider_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    product_count = db.query(Product).filter(Product.provider_id == provider_id).count()
    total_sales = db.query(Sale).filter(Sale.provider_id == provider_id).count()
    rating_count = db.query(Sale).filter(
        Sale.provider_id == provider_id,
        Sale.rating.isnot(None)
    ).count()
    
    return _serialize_full(provider, product_count, total_sales, rating_count)


@router.put("/{provider_id}")
def update_provider(
    provider_id: int,
    payload: ProviderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    provider.name = payload.name.strip()
    provider.location = (payload.location or "").strip() or None
    provider.email = (payload.email or "").strip() or None
    provider.phone = (payload.phone or "").strip() or None
    provider.verified = bool(payload.verified)
    provider.response_time = (payload.response_time or "").strip() or None
    provider.min_order_qty = (payload.min_order_qty or "").strip() or None
    if payload.description:
        provider.description = payload.description
    
    db.commit()
    db.refresh(provider)
    return _serialize(provider)


@router.post("/", status_code=201)
def create_provider(
    payload: ProviderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Provider name must be at least 2 characters")

    model = Provider(
        name=name,
        location=(payload.location or "").strip() or None,
        email=(payload.email or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        verified=bool(payload.verified),
        response_time=(payload.response_time or "").strip() or None,
        min_order_qty=(payload.min_order_qty or "").strip() or None,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return _serialize(model)


@router.delete("/{provider_id}")
def delete_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(provider)
    db.commit()
    return {"message": "Provider deleted", "provider_id": provider_id}
