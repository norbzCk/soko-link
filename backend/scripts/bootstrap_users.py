"""Create the three trusted first accounts from operator supplied environment."""

from __future__ import annotations

import os
import re

from sqlalchemy import func

from backend.services.identity.auth import (
    create_customer_profile,
    create_identity,
    hash_password,
    validate_phone_format,
)
from backend.services.identity.identity_service import (
    ROLE_APPROVED,
    ROLE_CUSTOMER,
    ROLE_SELLER,
    ROLE_SUPER_ADMIN,
    STATUS_ACTIVE,
    ensure_role,
)
from backend.shared.database import SessionLocal
from backend.shared.models import BusinessMetrics, BusinessUser, Identity, IdentityRole, User


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Required bootstrap setting {name} is missing.")
    return value


def _password(name: str) -> str:
    value = _required(name)
    if (
        len(value) < 12
        or not re.search(r"[A-Z]", value)
        or not re.search(r"[a-z]", value)
        or not re.search(r"\d", value)
        or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", value)
    ):
        raise RuntimeError(f"{name} must be 12+ characters and include upper, lower, digit, and symbol.")
    return value


def _identity(db, email: str, name: str, password: str, phone: str | None) -> tuple[Identity, bool]:
    existing = db.query(Identity).filter(func.lower(Identity.email) == email.lower()).first()
    if existing:
        return existing, False
    identity = create_identity(
        db,
        name=name,
        email=email,
        phone=phone,
        password=password,
        status=STATUS_ACTIVE,
        email_verified=True,
        phone_verified=False,
    )
    return identity, True


def bootstrap() -> list[tuple[str, str]]:
    admin_email = _required("SUPERADMIN_EMAIL").lower()
    admin_password = _password("SUPERADMIN_PASSWORD")
    seller_email = _required("INITIAL_SELLER_EMAIL").lower()
    seller_password = _password("INITIAL_SELLER_PASSWORD")
    seller_phone = validate_phone_format(_required("INITIAL_SELLER_PHONE"))
    seller_business_name = _required("INITIAL_SELLER_BUSINESS_NAME")
    seller_name = _required("INITIAL_SELLER_NAME")
    customer_email = _required("INITIAL_CUSTOMER_EMAIL").lower()
    customer_password = _password("INITIAL_CUSTOMER_PASSWORD")

    emails = {admin_email, seller_email, customer_email}
    if len(emails) != 3:
        raise RuntimeError("The three bootstrap accounts must use distinct email addresses.")

    db = SessionLocal()
    created: list[tuple[str, str]] = []
    try:
        specifications = [
            (admin_email, "Platform Administrator", admin_password, None, ROLE_SUPER_ADMIN, User),
            (seller_email, seller_name, seller_password, seller_phone, ROLE_SELLER, BusinessUser),
            (customer_email, "Initial Customer", customer_password, None, ROLE_CUSTOMER, User),
        ]
        for email, name, password, phone, role, profile_model in specifications:
            identity = db.query(Identity).filter(func.lower(Identity.email) == email).first()
            if identity:
                profile = (
                    db.query(profile_model)
                    .filter(profile_model.identity_id == identity.id)
                    .first()
                )
                role_row = (
                    db.query(IdentityRole)
                    .filter(IdentityRole.identity_id == identity.id, IdentityRole.role == role)
                    .first()
                )
                if not profile or not role_row or role_row.status != ROLE_APPROVED:
                    raise RuntimeError(
                        f"Existing account {email} is incomplete or has a different role; refusing to modify it."
                    )
                created.append((email, "already present"))
                continue

            identity, _ = _identity(db, email, name, password, phone)
            if role == ROLE_SUPER_ADMIN:
                profile = User(
                    identity_id=identity.id,
                    name=name,
                    email=email,
                    password_hash=identity.password_hash,
                    role="super_admin",
                    account_status=STATUS_ACTIVE,
                    is_active=True,
                    is_verified=True,
                )
                db.add(profile)
                db.flush()
            elif role == ROLE_SELLER:
                profile = BusinessUser(
                    identity_id=identity.id,
                    business_name=seller_business_name,
                    owner_name=name,
                    phone=phone,
                    email=email,
                    password_hash=identity.password_hash,
                    role="seller",
                    account_status=STATUS_ACTIVE,
                    is_active=True,
                    is_verified=False,
                    verification_status="pending",
                )
                db.add(profile)
                db.flush()
                db.add(BusinessMetrics(business_id=profile.id))
            else:
                profile = create_customer_profile(db, identity)
                profile.is_verified = True
                profile.account_status = STATUS_ACTIVE

            ensure_role(db, identity.id, role, status=ROLE_APPROVED)
            created.append((email, "created"))

        db.commit()
        return created
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    for email, status in bootstrap():
        print(f"{status}: {email}")
