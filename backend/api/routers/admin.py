from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.identity.auth import hash_password, require_roles
from backend.services.intelligence.marketplace_intelligence import build_superadmin_overview
from backend.services.notifications.notification_service import create_notification, resolve_subject
from backend.shared.database import get_db
from backend.shared.models import BusinessMetrics, BusinessUser, Customer, LogisticsMetrics, LogisticsUser, User

router = APIRouter(tags=["Superadmin"])


@router.get("/superadmin/stats")
def superadmin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    return build_superadmin_overview(db)


@router.get("/superadmin/me")
def superadmin_me(
    current: User = Depends(require_roles("super_admin", "owner")),
):
    return {
        "id": current.id,
        "name": current.name,
        "email": current.email,
        "role": current.role,
        "is_active": current.is_active,
    }


@router.get("/superadmin/businessmen")
def superadmin_businessmen(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    items = db.query(BusinessUser).order_by(BusinessUser.created_at.desc(), BusinessUser.id.desc()).all()
    return [
        {
            "id": item.id,
            "business_name": item.business_name,
            "owner_name": item.owner_name,
            "email": item.email,
            "phone": item.phone,
            "verification_status": item.verification_status,
            "is_active": item.is_active,
            "region": item.region,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@router.post("/superadmin/businessmen", status_code=201)
def create_superadmin_businessman(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    business_name = (payload.get("business_name") or "").strip()
    owner_name = (payload.get("owner_name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    email = (payload.get("email") or "").strip().lower() or None
    password = payload.get("password") or ""

    if len(business_name) < 2 or len(owner_name) < 2:
        raise HTTPException(status_code=400, detail="Business name and owner name are required")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    if email and "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing_phone = db.query(BusinessUser).filter(BusinessUser.phone == phone).first()
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    if email:
        existing_email = db.query(BusinessUser).filter(text("lower(email) = :email")).params(email=email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")

    model = BusinessUser(
        business_name=business_name,
        owner_name=owner_name,
        phone=phone,
        email=email,
        password_hash=hash_password(password),
        business_type=(payload.get("business_type") or "individual").strip() or "individual",
        category=(payload.get("category") or "").strip() or None,
        description=(payload.get("description") or "").strip() or None,
        region=(payload.get("region") or "Dar es Salaam").strip() or "Dar es Salaam",
        area=(payload.get("area") or "").strip() or None,
        street=(payload.get("street") or "").strip() or None,
        shop_number=(payload.get("shop_number") or "").strip() or None,
        operating_hours=(payload.get("operating_hours") or "").strip() or None,
        shop_logo_url=(payload.get("shop_logo_url") or "").strip() or None,
        shop_images=(payload.get("shop_images") or "").strip() or None,
        profile_photo=(payload.get("profile_photo") or "").strip() or None,
        website_url=(payload.get("website_url") or "").strip() or None,
        social_facebook=(payload.get("social_facebook") or "").strip() or None,
        social_instagram=(payload.get("social_instagram") or "").strip() or None,
        social_whatsapp=(payload.get("social_whatsapp") or "").strip() or None,
        social_x=(payload.get("social_x") or "").strip() or None,
        role="seller",
        is_active=True,
    )
    db.add(model)
    db.commit()
    db.refresh(model)

    db.add(BusinessMetrics(business_id=model.id))
    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(model)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="A business account was created for you",
        message="Your SokoLnk seller account has been created by an administrator. You can now sign in and manage your storefront.",
        notification_type="system",
        severity="success",
        action_href="/login",
        send_email=bool(recipient_email),
        email_subject="Your SokoLnk seller account is ready",
        email_body=f"Hello {recipient_name},\n\nAn administrator created your seller account. You can sign in and start using SokoLnk.\n\nSokoLnk Team",
        background_tasks=background_tasks,
    )
    db.commit()

    return {
        "id": model.id,
        "business_name": model.business_name,
        "owner_name": model.owner_name,
        "email": model.email,
        "phone": model.phone,
        "created_at": model.created_at.isoformat() if model.created_at else None,
    }


@router.get("/superadmin/customers")
def superadmin_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    items = (
        db.query(User)
        .filter(User.role == "user")
        .order_by(User.created_at.desc(), User.id.desc())
        .all()
    )
    return [
        {
            "id": item.id,
            "name": item.name,
            "email": item.email,
            "phone": item.phone,
            "is_verified": item.is_verified,
            "is_active": item.is_active,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@router.post("/superadmin/customers", status_code=201)
def create_superadmin_customer(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip() or None
    password = payload.get("password") or ""

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name is required")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    model = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role="user",
        is_active=True,
        is_verified=True,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(model)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="A customer account was created for you",
        message="Your SokoLnk buyer account has been created by an administrator.",
        notification_type="system",
        severity="success",
        action_href="/login",
        send_email=bool(recipient_email),
        email_subject="Your SokoLnk buyer account is ready",
        email_body=f"Hello {recipient_name},\n\nAn administrator created your buyer account.\n\nSokoLnk Team",
        background_tasks=background_tasks,
    )
    db.commit()

    return {
        "id": model.id,
        "name": model.name,
        "email": model.email,
        "phone": model.phone,
        "created_at": model.created_at.isoformat() if model.created_at else None,
    }


@router.get("/superadmin/logistics")
def superadmin_logistics(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    items = db.query(LogisticsUser).order_by(LogisticsUser.created_at.desc(), LogisticsUser.id.desc()).all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "email": item.email,
            "phone": item.phone,
            "account_type": item.account_type,
            "verification_status": item.verification_status,
            "is_active": item.is_active,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@router.get("/superadmin/verifications")
def superadmin_verifications(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    sellers = (
        db.query(BusinessUser)
        .order_by(BusinessUser.verification_status.asc(), BusinessUser.created_at.desc(), BusinessUser.id.desc())
        .all()
    )
    logistics_items = (
        db.query(LogisticsUser)
        .order_by(LogisticsUser.verification_status.asc(), LogisticsUser.created_at.desc(), LogisticsUser.id.desc())
        .all()
    )
    users = (
        db.query(User)
        .filter(User.role == "user", User.is_verified == False)
        .order_by(User.created_at.desc(), User.id.desc())
        .all()
    )
    return {
        "businessmen": [
            {
                "id": item.id,
                "business_name": item.business_name,
                "owner_name": item.owner_name,
                "phone": item.phone,
                "email": item.email,
                "category": item.category,
                "region": item.region,
                "area": item.area,
                "verification_status": item.verification_status,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in sellers
        ],
        "logistics": [
            {
                "id": item.id,
                "name": item.name,
                "phone": item.phone,
                "email": item.email,
                "vehicle_type": item.vehicle_type,
                "base_area": item.base_area,
                "coverage_areas": item.coverage_areas,
                "verification_status": item.verification_status,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in logistics_items
        ],
        "users": [
            {
                "id": item.id,
                "name": item.name,
                "email": item.email,
                "phone": item.phone,
                "is_verified": item.is_verified,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in users
        ],
    }


@router.patch("/superadmin/businessmen/{business_id}/verification")
def update_superadmin_business_verification(
    business_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(BusinessUser).filter(BusinessUser.id == business_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Business account not found")

    status = str(payload.get("status") or "").strip().lower()
    if status not in {"verified", "pending", "rejected", "unverified"}:
        raise HTTPException(status_code=400, detail="Invalid verification status")

    item.verification_status = status
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "message": "Business verification updated",
        "id": item.id,
        "verification_status": item.verification_status,
    }


@router.patch("/superadmin/businessmen/{business_id}/status")
def update_superadmin_business_status(
    business_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    """Suspend/reactivate a seller account. Deliberately separate from
    DELETE: deleting a seller is permanent and destroys their order/product
    history, which is far too blunt a tool for routine moderation (a policy
    violation, an unresponsive seller, a dispute under review). This is the
    reversible action that was missing -- previously the only options for a
    problem seller were "do nothing" or "delete everything they have"."""
    item = db.query(BusinessUser).filter(BusinessUser.id == business_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Business account not found")

    is_active = payload.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=400, detail="is_active (true/false) is required")

    item.is_active = is_active
    db.add(item)
    db.commit()
    db.refresh(item)

    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(item)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="Your seller account has been reactivated" if is_active else "Your seller account has been suspended",
        message=(
            "Your SokoLnk seller account is active again -- you can resume listing and fulfilling orders."
            if is_active
            else "Your SokoLnk seller account has been suspended by an administrator. Contact support for details."
        ),
        notification_type="system",
        severity="success" if is_active else "warning",
        send_email=bool(recipient_email),
        email_subject="Your SokoLnk seller account status has changed",
        email_body=f"Hello {recipient_name},\n\nYour seller account status is now: {'active' if is_active else 'suspended'}.\n\nSokoLnk Team",
        background_tasks=background_tasks,
    )
    db.commit()

    return {"message": "Business status updated", "id": item.id, "is_active": item.is_active}


@router.patch("/superadmin/logistics/{logistics_id}/verification")
def update_superadmin_logistics_verification(
    logistics_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(LogisticsUser).filter(LogisticsUser.id == logistics_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Logistics account not found")

    status = str(payload.get("status") or "").strip().lower()
    if status not in {"verified", "pending", "rejected", "unverified"}:
        raise HTTPException(status_code=400, detail="Invalid verification status")

    item.verification_status = status
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "message": "Logistics verification updated",
        "id": item.id,
        "verification_status": item.verification_status,
    }


@router.patch("/superadmin/logistics/{logistics_id}/status")
def update_superadmin_logistics_status(
    logistics_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    """Suspend/reactivate a logistics partner account -- same rationale as
    the businessman status endpoint: reversible moderation, distinct from
    permanent deletion."""
    item = db.query(LogisticsUser).filter(LogisticsUser.id == logistics_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Logistics account not found")

    is_active = payload.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=400, detail="is_active (true/false) is required")

    item.is_active = is_active
    db.add(item)
    db.commit()
    db.refresh(item)

    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(item)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="Your delivery account has been reactivated" if is_active else "Your delivery account has been suspended",
        message=(
            "Your SokoLnk delivery account is active again -- you can resume accepting deliveries."
            if is_active
            else "Your SokoLnk delivery account has been suspended by an administrator. Contact support for details."
        ),
        notification_type="system",
        severity="success" if is_active else "warning",
        send_email=bool(recipient_email),
        email_subject="Your SokoLnk delivery account status has changed",
        email_body=f"Hello {recipient_name},\n\nYour delivery account status is now: {'active' if is_active else 'suspended'}.\n\nSokoLnk Team",
        background_tasks=background_tasks,
    )
    db.commit()

    return {"message": "Logistics status updated", "id": item.id, "is_active": item.is_active}


@router.post("/superadmin/logistics", status_code=201)
def create_superadmin_logistics(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower() or None
    phone = (payload.get("phone") or "").strip()
    password = payload.get("password") or ""

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    if email and "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing_phone = db.query(LogisticsUser).filter(LogisticsUser.phone == phone).first()
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    if email:
        existing_email = db.query(LogisticsUser).filter(text("lower(email) = :email")).params(email=email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")

    model = LogisticsUser(
        name=name,
        phone=phone,
        email=email,
        password_hash=hash_password(password),
        account_type=(payload.get("account_type") or "individual").strip() or "individual",
        vehicle_type=(payload.get("vehicle_type") or "").strip() or None,
        plate_number=(payload.get("plate_number") or "").strip() or None,
        license_number=(payload.get("license_number") or "").strip() or None,
        base_area=(payload.get("base_area") or "").strip() or None,
        coverage_areas=(payload.get("coverage_areas") or "").strip() or None,
        is_active=True,
    )
    db.add(model)
    db.commit()
    db.refresh(model)

    db.add(LogisticsMetrics(logistics_id=model.id))
    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(model)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="A logistics account was created for you",
        message="Your SokoLnk delivery account has been created by an administrator.",
        notification_type="system",
        severity="success",
        action_href="/login",
        send_email=bool(recipient_email),
        email_subject="Your SokoLnk delivery account is ready",
        email_body=f"Hello {recipient_name},\n\nAn administrator created your delivery account.\n\nSokoLnk Team",
        background_tasks=background_tasks,
    )
    db.commit()

    return {
        "id": model.id,
        "name": model.name,
        "email": model.email,
        "phone": model.phone,
        "account_type": model.account_type,
        "created_at": model.created_at.isoformat() if model.created_at else None,
    }


@router.delete("/superadmin/businessmen/{business_id}")
def delete_superadmin_businessman(
    business_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(BusinessUser).filter(BusinessUser.id == business_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Business account not found")
    db.delete(item)
    db.commit()
    return {"message": "Business account deleted"}


@router.delete("/superadmin/customers/{customer_id}")
def delete_superadmin_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(User).filter(User.id == customer_id, User.role == "user").first()
    if not item:
        raise HTTPException(status_code=404, detail="Customer account not found")
    db.delete(item)
    db.commit()
    return {"message": "Customer account deleted"}


@router.patch("/superadmin/customers/{customer_id}/verification")
def update_superadmin_customer_verification(
    customer_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(User).filter(User.id == customer_id, User.role == "user").first()
    if not item:
        raise HTTPException(status_code=404, detail="Customer account not found")

    status = str(payload.get("status") or "").strip().lower()
    if status not in {"verified", "unverified"}:
        raise HTTPException(status_code=400, detail="Invalid verification status")

    item.is_verified = status == "verified"
    item.verification_token = None
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "message": "Customer verification updated",
        "id": item.id,
        "is_verified": item.is_verified,
    }


@router.patch("/superadmin/customers/{customer_id}")
def update_superadmin_customer(
    customer_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(User).filter(User.id == customer_id, User.role == "user").first()
    if not item:
        raise HTTPException(status_code=404, detail="Customer account not found")

    role = str(payload.get("role") or item.role).strip().lower()
    if role not in {"user", "admin", "super_admin", "owner"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    is_active = payload.get("is_active")
    if is_active is not None:
        item.is_active = bool(is_active)

    item.role = role
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "name": item.name,
        "email": item.email,
        "role": item.role,
        "is_active": item.is_active,
        "is_verified": item.is_verified,
    }


@router.delete("/superadmin/logistics/{logistics_id}")
def delete_superadmin_logistics(
    logistics_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("super_admin", "owner")),
):
    item = db.query(LogisticsUser).filter(LogisticsUser.id == logistics_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Logistics account not found")
    db.delete(item)
    db.commit()
    return {"message": "Logistics account deleted"}
