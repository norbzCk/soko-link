from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.services.identity.auth import require_roles
from backend.shared.schemas import CustomerCreate
from backend.shared.database import get_db
from backend.shared.models import Customer, User

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("/")
def get_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    return db.query(Customer).all()


@router.post("/", status_code=201)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    new_customer = Customer(
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        location=customer.location,
    )
    db.add(new_customer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Customer phone already exists")
    db.refresh(new_customer)
    return new_customer
