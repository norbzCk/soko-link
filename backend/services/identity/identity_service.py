"""Shared IAM primitives for unified identities and role assignments.

This module deliberately contains no FastAPI dependencies so it can be used by
auth routes, admin routes, migrations, and tests without circular imports.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.shared.models import (
    AuditLog,
    BusinessUser,
    Identity,
    IdentityRole,
    LogisticsUser,
    RoleApplication,
    User,
    VerificationToken,
)

ROLE_CUSTOMER = "CUSTOMER"
ROLE_SELLER = "SELLER"
ROLE_LOGISTICS_PROVIDER = "LOGISTICS_PROVIDER"
ROLE_ADMINISTRATOR = "ADMINISTRATOR"
ROLE_ANALYST = "ANALYST"
ROLE_SUPER_ADMIN = "SUPER_ADMIN"

PUBLIC_ROLES = {
    ROLE_CUSTOMER,
    ROLE_SELLER,
    ROLE_LOGISTICS_PROVIDER,
    ROLE_ADMINISTRATOR,
    ROLE_ANALYST,
}
APPLICATION_ROLES = {ROLE_SELLER, ROLE_LOGISTICS_PROVIDER}

STATUS_PENDING_VERIFICATION = "PENDING_VERIFICATION"
STATUS_ACTIVE = "ACTIVE"
STATUS_SUSPENDED = "SUSPENDED"
STATUS_DISABLED = "DISABLED"
ACCOUNT_STATUSES = {
    STATUS_PENDING_VERIFICATION,
    STATUS_ACTIVE,
    STATUS_SUSPENDED,
    STATUS_DISABLED,
}

ROLE_PENDING = "PENDING"
ROLE_APPROVED = "APPROVED"
ROLE_REJECTED = "REJECTED"
ROLE_SUSPENDED = "SUSPENDED"
APPLICATION_STATUSES = {ROLE_PENDING, ROLE_APPROVED, ROLE_REJECTED, ROLE_SUSPENDED}

_ROLE_ALIASES = {
    "CUSTOMER": ROLE_CUSTOMER,
    "USER": ROLE_CUSTOMER,
    "BUYER": ROLE_CUSTOMER,
    "SELLER": ROLE_SELLER,
    "BUSINESS": ROLE_SELLER,
    "LOGISTICS": ROLE_LOGISTICS_PROVIDER,
    "LOGISTICS_PROVIDER": ROLE_LOGISTICS_PROVIDER,
    "DELIVERY": ROLE_LOGISTICS_PROVIDER,
    "ADMIN": ROLE_ADMINISTRATOR,
    "ADMINISTRATOR": ROLE_ADMINISTRATOR,
    "ANALYST": ROLE_ANALYST,
    "SUPER_ADMIN": ROLE_SUPER_ADMIN,
    "SUPERADMIN": ROLE_SUPER_ADMIN,
    "OWNER": ROLE_SUPER_ADMIN,
}

_CANONICAL_TO_LEGACY = {
    ROLE_CUSTOMER: "user",
    ROLE_SELLER: "seller",
    ROLE_LOGISTICS_PROVIDER: "logistics",
    ROLE_ADMINISTRATOR: "admin",
    ROLE_ANALYST: "analyst",
    ROLE_SUPER_ADMIN: "super_admin",
}


def canonical_role(value: str | None) -> str:
    role = (value or "").strip().upper()
    return _ROLE_ALIASES.get(role, role)


def legacy_role(value: str | None) -> str:
    role = canonical_role(value)
    return _CANONICAL_TO_LEGACY.get(role, (value or "").strip().lower())


def normalize_role(value: str | None) -> str:
    return legacy_role(value)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def new_verification_token() -> str:
    return secrets.token_urlsafe(32)


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def issue_verification_token(
    db: Session,
    identity_id: int,
    *,
    purpose: str,
    channel: str,
    ttl_seconds: int,
    raw_token: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> tuple[str, VerificationToken]:
    raw = raw_token or new_verification_token()
    now = utcnow()

    db.query(VerificationToken).filter(
        VerificationToken.identity_id == identity_id,
        VerificationToken.purpose == purpose,
        VerificationToken.channel == channel,
        VerificationToken.used_at.is_(None),
    ).update({VerificationToken.used_at: now}, synchronize_session=False)

    record = VerificationToken(
        identity_id=identity_id,
        purpose=purpose,
        channel=channel,
        token_hash=hash_token(raw),
        expires_at=now + timedelta(seconds=ttl_seconds),
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    db.add(record)
    db.flush()
    return raw, record


def consume_verification_token(
    db: Session,
    raw_token: str,
    *,
    purpose: str,
    channel: str | None = None,
) -> VerificationToken | None:
    if not raw_token:
        return None
    query = db.query(VerificationToken).filter(
        VerificationToken.token_hash == hash_token(raw_token),
        VerificationToken.purpose == purpose,
        VerificationToken.used_at.is_(None),
    )
    if channel:
        query = query.filter(VerificationToken.channel == channel)
    record = query.first()
    if not record:
        return None
    expires_at = as_utc(record.expires_at)
    if expires_at is None or expires_at <= utcnow():
        return None
    record.attempts = int(record.attempts or 0) + 1
    return record


def ensure_role(
    db: Session,
    identity_id: int,
    role: str,
    *,
    status: str = ROLE_APPROVED,
    approved_by: int | None = None,
) -> IdentityRole:
    canonical = canonical_role(role)
    record = (
        db.query(IdentityRole)
        .filter(IdentityRole.identity_id == identity_id, IdentityRole.role == canonical)
        .first()
    )
    if not record:
        record = IdentityRole(identity_id=identity_id, role=canonical, status=status)
        db.add(record)
    elif status and record.status != status:
        record.status = status
    if status == ROLE_APPROVED and record.approved_at is None:
        record.approved_at = utcnow()
        record.approved_by = approved_by
    db.flush()
    return record


def roles_for_identity(db: Session, identity_id: int, *, approved_only: bool = True) -> list[IdentityRole]:
    query = db.query(IdentityRole).filter(IdentityRole.identity_id == identity_id)
    if approved_only:
        query = query.filter(IdentityRole.status == ROLE_APPROVED)
    return query.order_by(IdentityRole.role.asc()).all()


def approved_role_names(db: Session, identity_id: int) -> list[str]:
    return [item.role for item in roles_for_identity(db, identity_id, approved_only=True)]


def role_is_approved(db: Session, identity_id: int, role: str) -> bool:
    canonical = canonical_role(role)
    return (
        db.query(IdentityRole)
        .filter(
            IdentityRole.identity_id == identity_id,
            IdentityRole.role == canonical,
            IdentityRole.status == ROLE_APPROVED,
        )
        .first()
        is not None
    )


def profile_for_role(db: Session, identity_id: int, role: str):
    canonical = canonical_role(role)
    if canonical == ROLE_SELLER:
        return db.query(BusinessUser).filter(BusinessUser.identity_id == identity_id).first()
    if canonical == ROLE_LOGISTICS_PROVIDER:
        return db.query(LogisticsUser).filter(LogisticsUser.identity_id == identity_id).first()
    return db.query(User).filter(User.identity_id == identity_id).first()


def default_profile(db: Session, identity_id: int):
    for role in (ROLE_CUSTOMER, ROLE_SELLER, ROLE_LOGISTICS_PROVIDER, ROLE_ADMINISTRATOR, ROLE_ANALYST):
        profile = profile_for_role(db, identity_id, role)
        if profile is not None:
            return profile
    return None


def profile_user_type(profile) -> str:
    if isinstance(profile, BusinessUser):
        return "business"
    if isinstance(profile, LogisticsUser):
        return "logistics"
    return "user"


def profile_role(profile, user_type: str | None = None) -> str:
    if user_type == "business" or isinstance(profile, BusinessUser):
        return ROLE_SELLER
    if user_type == "logistics" or isinstance(profile, LogisticsUser):
        return ROLE_LOGISTICS_PROVIDER
    role = canonical_role(getattr(profile, "role", None))
    if role in {ROLE_ADMINISTRATOR, ROLE_ANALYST, ROLE_SUPER_ADMIN}:
        return role
    return ROLE_CUSTOMER


def identity_role_names(db: Session, identity: Identity, *, include_legacy_role: str | None = None) -> list[str]:
    roles = approved_role_names(db, identity.id)
    if include_legacy_role:
        legacy = canonical_role(include_legacy_role)
        if legacy and legacy not in roles:
            roles.append(legacy)
    return roles


def ensure_identity_for_profile(db: Session, profile, user_type: str | None = None) -> Identity:
    """Create/reuse a canonical identity for an older profile row.

    Legacy rows keep working without a migration. When they log in or need
    multi-role support we attach them to an identity using the same phone or
    email so an existing customer/seller with matching details becomes one
    identity instead of two.
    """
    if getattr(profile, "identity_id", None):
        identity = db.query(Identity).filter(Identity.id == profile.identity_id).first()
        if identity:
            return identity

    email = (getattr(profile, "email", None) or "").strip().lower()
    phone = (getattr(profile, "phone", None) or "").strip() or None
    if not email:
        email = f"{phone or 'legacy-' + str(getattr(profile, 'id', 0))}@phone.local"

    identity = None
    if email:
        identity = db.query(Identity).filter(func.lower(Identity.email) == email).first()
    if identity is None and phone:
        identity = db.query(Identity).filter(Identity.phone == phone).first()
    if identity is None:
        identity = Identity(
            name=(
                getattr(profile, "name", None)
                or getattr(profile, "business_name", None)
                or getattr(profile, "owner_name", None)
                or "SokoLink user"
            ),
            email=email,
            phone=phone,
            password_hash=getattr(profile, "password_hash", "") or "",
            status=STATUS_ACTIVE,
            email_verified=bool(getattr(profile, "is_verified", False)),
            phone_verified=False,
        )
        db.add(identity)
        db.flush()

    profile.identity_id = identity.id
    canonical = profile_role(profile, user_type)
    ensure_role(db, identity.id, canonical, status=ROLE_APPROVED)
    if canonical in {ROLE_CUSTOMER, ROLE_ADMINISTRATOR, ROLE_ANALYST}:
        profile.role = legacy_role(canonical)
    db.flush()
    return identity


def serialize_role_application(item: RoleApplication) -> dict[str, Any]:
    payload = None
    if item.payload_json:
        try:
            payload = json.loads(item.payload_json)
        except json.JSONDecodeError:
            payload = None
    return {
        "id": item.id,
        "identity_id": item.identity_id,
        "role": item.role,
        "status": item.status,
        "payload": payload,
        "reviewer_id": item.reviewer_id,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "rejection_reason": item.rejection_reason,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def serialize_identity(db: Session, identity: Identity) -> dict[str, Any]:
    roles = roles_for_identity(db, identity.id, approved_only=False)
    return {
        "id": identity.id,
        "name": identity.name,
        "email": identity.email,
        "phone": identity.phone,
        "status": identity.status,
        "email_verified": identity.email_verified,
        "phone_verified": identity.phone_verified,
        "roles": [
            {"role": item.role, "status": item.status}
            for item in roles
        ],
    }


def audit(
    db: Session,
    *,
    actor_type: str,
    actor_id: int | None,
    entity_type: str,
    entity_id: int | None,
    action: str,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            details_json=json.dumps(details) if details else None,
        )
    )
