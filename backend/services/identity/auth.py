import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.shared.database import SessionLocal, get_db
from backend.services.notifications.notification_service import build_login_email, build_password_reset_email, create_notification, resolve_subject, smtp_enabled
from backend.shared.models import (
    BusinessMetrics,
    BusinessUser,
    Identity,
    IdentityRole,
    LogisticsMetrics,
    LogisticsUser,
    RefreshToken,
    RoleApplication,
    TokenBlocklist,
    User,
    VerificationToken,
)
from backend.services.identity.identity_service import (
    ACCOUNT_STATUSES,
    APPLICATION_ROLES,
    APPLICATION_STATUSES,
    PUBLIC_ROLES,
    ROLE_ADMINISTRATOR,
    ROLE_ANALYST,
    ROLE_APPROVED,
    ROLE_CUSTOMER,
    ROLE_LOGISTICS_PROVIDER,
    ROLE_PENDING,
    ROLE_REJECTED,
    ROLE_SELLER,
    ROLE_SUPER_ADMIN,
    ROLE_SUSPENDED,
    STATUS_ACTIVE,
    STATUS_DISABLED,
    STATUS_PENDING_VERIFICATION,
    STATUS_SUSPENDED,
    audit,
    approved_role_names,
    as_utc,
    canonical_role,
    consume_identity_otp,
    consume_verification_token,
    default_profile,
    ensure_identity_for_profile,
    ensure_role,
    invalidate_verification_tokens,
    issue_verification_token,
    legacy_role,
    new_otp,
    normalize_role as normalize_iam_role,
    profile_for_role,
    profile_role,
    profile_user_type,
    role_is_approved,
    roles_for_identity,
    serialize_identity,
    serialize_role_application,
    utcnow,
)

# Security Constants
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7
PASSWORD_RESET_TTL_SECONDS = 60 * 30
EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24
EMAIL_VERIFICATION_OTP_PURPOSE = "email_verification_otp"
REGISTRATION_OTP_TTL_SECONDS = 60 * 10
EMAIL_OTP_MAX_ATTEMPTS = 5
PHONE_OTP_TTL_SECONDS = 60 * 10
SECRET_KEY = os.getenv("APP_SECRET_KEY", "").strip()
if len(SECRET_KEY) < 32:
    raise RuntimeError("APP_SECRET_KEY must be configured with at least 32 characters.")
ALGORITHM = "HS256"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
APP_ENV = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).strip().lower()
IS_PRODUCTION = APP_ENV == "production"


security = HTTPBearer(auto_error=False)
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

from backend.shared.utils.uploads import save_uploaded_image

router = APIRouter(prefix="/auth", tags=["Auth"])


def _normalize_role(value: str | None) -> str:
    return normalize_iam_role(value)


def validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")


def validate_phone_format(phone: str) -> str:
    """Accepts Tanzanian mobile formats: +255XXXXXXXXX, 255XXXXXXXXX, or
    0XXXXXXXXX (9 digits after the prefix). Returns the phone normalized to
    +255XXXXXXXXX. Previously NONE of the registration endpoints validated
    phone format at all -- only uniqueness -- so "abc", "123", or an empty
    string were all silently accepted as a phone number."""
    digits_only = re.sub(r"[^\d+]", "", phone or "")
    match = re.fullmatch(r"(?:\+?255|0)(\d{9})", digits_only)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid Tanzanian phone number, e.g. 0712345678 or +255712345678",
        )
    return f"+255{match.group(1)}"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False

    try:
        salt_hex, digest_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
        return hmac.compare_digest(check, expected)
    except ValueError:
        pass

    # Backward compatibility
    if hmac.compare_digest(stored, password):
        return True

    legacy_hashers = {32: "md5", 40: "sha1", 64: "sha256", 128: "sha512"}
    normalized = stored.strip().lower()
    algorithm = legacy_hashers.get(len(normalized))
    if algorithm and all(ch in "0123456789abcdef" for ch in normalized):
        legacy_digest = hashlib.new(algorithm, password.encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy_digest, normalized)
    return False


def password_needs_rehash(stored: str | None) -> bool:
    return "$" not in (stored or "")


def verify_and_upgrade_password(password: str, account: User | BusinessUser | LogisticsUser) -> bool:
    if not verify_password(password, account.password_hash):
        return False
    if password_needs_rehash(account.password_hash):
        account.password_hash = hash_password(password)
    return True


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    if "sub" in to_encode and not isinstance(to_encode["sub"], str):
        to_encode["sub"] = str(to_encode["sub"])
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(
    user_id: int,
    user_type: str,
    db: Session,
    *,
    identity_id: int | None = None,
    active_role: str | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    token = secrets.token_urlsafe(32)
    db_token = RefreshToken(
        user_id=user_id,
        identity_id=identity_id,
        active_role=active_role,
        user_type=user_type,
        token=token,
        expires_at=expire,
    )
    db.add(db_token)
    db.commit()
    return token


def decode_token(token: str, db: Session | None = None) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        if db and jti:
            blacklisted = db.query(TokenBlocklist).filter(TokenBlocklist.jti == jti).first()
            if blacklisted:
                raise HTTPException(status_code=401, detail="Token has been revoked")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=os.getenv("NODE_ENV") == "production",
    )
    if refresh_token:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            expires=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            samesite="lax",
            secure=os.getenv("NODE_ENV") == "production",
        )


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")


def _identity_url(path: str, token: str) -> str:
    separator = "&" if "?" in path else "?"
    return f"{FRONTEND_URL}{path}{separator}token={token}"


def _profile_status(profile) -> str:
    status = str(getattr(profile, "account_status", "") or "").strip().upper()
    if status in ACCOUNT_STATUSES:
        return status
    return STATUS_ACTIVE if getattr(profile, "is_active", True) else STATUS_SUSPENDED


def _assert_identity_login_allowed(identity: Identity):
    status = str(identity.status or "").strip().upper()
    if status == STATUS_PENDING_VERIFICATION:
        if not identity.email_verified and not identity.phone_verified:
            raise HTTPException(status_code=403, detail="Please verify your email before signing in.")
        raise HTTPException(status_code=403, detail="Your account is awaiting verification.")
    if status == STATUS_SUSPENDED:
        raise HTTPException(status_code=403, detail="This account has been suspended. Contact support.")
    if status == STATUS_DISABLED:
        raise HTTPException(status_code=403, detail="This account has been disabled. Contact support.")
    if status not in ACCOUNT_STATUSES:
        raise HTTPException(status_code=403, detail="This account cannot sign in right now.")


def _profile_and_type_for_role(db: Session, identity: Identity, role: str):
    canonical = canonical_role(role)
    if not role_is_approved(db, identity.id, canonical):
        raise HTTPException(status_code=403, detail="This role is not approved for your account.")
    profile = profile_for_role(db, identity.id, canonical)
    if profile is None:
        raise HTTPException(status_code=403, detail="No profile is linked to this role.")
    if not getattr(profile, "is_active", True) or _profile_status(profile) in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raise HTTPException(status_code=403, detail="This role profile has been suspended.")
    return profile, profile_user_type(profile), canonical


def _choose_active_role(db: Session, identity: Identity, requested_role: str | None = None) -> str:
    approved = approved_role_names(db, identity.id)
    if not approved:
        raise HTTPException(status_code=403, detail="Your role is awaiting administrator approval.")

    if requested_role:
        requested = canonical_role(requested_role)
        if requested not in approved:
            raise HTTPException(status_code=403, detail="You do not have access to that role.")
        return requested

    for preferred in (
        ROLE_SUPER_ADMIN,
        ROLE_CUSTOMER,
        ROLE_SELLER,
        ROLE_LOGISTICS_PROVIDER,
        ROLE_ADMINISTRATOR,
        ROLE_ANALYST,
    ):
        if preferred in approved:
            return preferred
    return approved[0]


def _serialize_profile(profile, user_type: str, active_role: str, roles: list[str]) -> dict:
    return {
        "id": getattr(profile, "id", None),
        "name": getattr(profile, "name", getattr(profile, "business_name", "User")),
        "email": getattr(profile, "email", None),
        "phone": getattr(profile, "phone", None),
        "address": getattr(profile, "address", None),
        "profile_photo": getattr(profile, "profile_photo", None),
        "role": legacy_role(active_role),
        "active_role": active_role,
        "roles": roles,
        "user_type": user_type,
        "is_verified": bool(getattr(profile, "is_verified", False)),
        "is_active": bool(getattr(profile, "is_active", True)),
        "account_status": _profile_status(profile),
    }


def _issue_identity_session(
    response: Response,
    db: Session,
    identity: Identity,
    active_role: str | None = None,
):
    canonical = _choose_active_role(db, identity, active_role)
    profile, user_type, canonical = _profile_and_type_for_role(db, identity, canonical)
    roles = approved_role_names(db, identity.id)
    identity.last_login_at = utcnow()
    if identity.status == STATUS_PENDING_VERIFICATION and (identity.email_verified or identity.phone_verified):
        identity.status = STATUS_ACTIVE
    db.add(identity)
    db.flush()

    token = create_access_token(
        {
            "sub": profile.id,
            "user_id": profile.id,
            "identity_id": identity.id,
            "role": legacy_role(canonical),
            "active_role": canonical,
            "roles": roles,
            "email": getattr(profile, "email", None),
            "phone": getattr(profile, "phone", None),
            "user_type": user_type,
        }
    )
    refresh_token = create_refresh_token(
        profile.id,
        user_type,
        db,
        identity_id=identity.id,
        active_role=canonical,
    )
    set_auth_cookies(response, token, refresh_token)
    user = _serialize_profile(profile, user_type, canonical, roles)
    return {
        "access_token": token,
        "token_type": "bearer",
        "userType": user_type,
        "user_type": user_type,
        "user": user,
        "roles": roles,
        "active_role": canonical,
    }


def _notify_identity(
    db: Session,
    identity: Identity,
    background_tasks: BackgroundTasks | None,
    *,
    title: str,
    message: str,
    subject: str,
    body: str,
    notification_type: str = "security",
    severity: str = "info",
    action_href: str | None = None,
):
    profile = default_profile(db, identity.id)
    if profile is None:
        return
    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(profile)
    return create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title=title,
        message=message,
        notification_type=notification_type,
        severity=severity,
        action_href=action_href,
        send_email=bool(recipient_email),
        email_subject=subject,
        email_body=body,
        background_tasks=background_tasks,
    )


def _send_email_verification(
    db: Session,
    identity: Identity,
    background_tasks: BackgroundTasks | None,
) -> str:
    raw, _ = issue_verification_token(
        db,
        identity.id,
        purpose="email_verification",
        channel="email",
        ttl_seconds=EMAIL_VERIFICATION_TTL_SECONDS,
    )
    otp = new_otp()
    issue_verification_token(
        db,
        identity.id,
        purpose=EMAIL_VERIFICATION_OTP_PURPOSE,
        channel="email",
        ttl_seconds=REGISTRATION_OTP_TTL_SECONDS,
        raw_token=otp,
    )
    url = _identity_url("/verify-email", raw)
    body = (
        f"Hello {identity.name},\n\n"
        "Confirm your email address to activate your SokoLink account.\n\n"
        f"Your verification code is {otp}. Enter it on the verification page.\n"
        f"This code expires in {REGISTRATION_OTP_TTL_SECONDS // 60} minutes.\n\n"
        f"Or verify with this link: {url}\n\n"
        "This link expires in 24 hours. If you did not create an account, ignore this message.\n\n"
        "SokoLink Security"
    )
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Verify your email address",
        message="Confirm your email address to activate your SokoLink account.",
        subject="Verify your SokoLink email address",
        body=body,
        severity="info",
        action_href="/verify-email",
    )
    if not smtp_enabled() and not IS_PRODUCTION:
        logger.warning("SMTP is not configured; email verification link for %s: %s", identity.email, url)
        logger.warning("SMTP is not configured; email verification OTP for %s is %s", identity.email, otp)
    return raw


def _send_phone_otp(
    db: Session,
    identity: Identity,
    background_tasks: BackgroundTasks | None,
) -> str:
    otp = new_otp()
    issue_verification_token(
        db,
        identity.id,
        purpose="phone_verification",
        channel="phone",
        ttl_seconds=PHONE_OTP_TTL_SECONDS,
        raw_token=otp,
    )
    body = (
        f"Your SokoLink verification code is {otp}. "
        "It expires in 10 minutes. If you did not request it, ignore this message."
    )
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Phone verification code",
        message=body,
        subject="Your SokoLink verification code",
        body=body,
        severity="info",
    )
    if not smtp_enabled() and not IS_PRODUCTION:
        logger.warning("SMS provider is not configured; phone OTP for %s is %s", identity.phone, otp)
    return otp


def _contact_conflict(db: Session, email: str | None, phone: str | None, *, exclude_identity_id: int | None = None):
    if email:
        lowered = email.strip().lower()
        identity = db.query(Identity).filter(func.lower(Identity.email) == lowered).first()
        if identity and identity.id != exclude_identity_id:
            return "Email already registered"
        for model in (User, BusinessUser, LogisticsUser):
            row = db.query(model).filter(func.lower(model.email) == lowered).first()
            if row and (exclude_identity_id is None or getattr(row, "identity_id", None) != exclude_identity_id):
                return "Email already registered"
    if phone:
        identity = db.query(Identity).filter(Identity.phone == phone).first()
        if identity and identity.id != exclude_identity_id:
            return "Phone number already registered"
        for model in (User, BusinessUser, LogisticsUser):
            row = db.query(model).filter(model.phone == phone).first()
            if row and (exclude_identity_id is None or getattr(row, "identity_id", None) != exclude_identity_id):
                return "Phone number already registered"
    return None


def create_identity(
    db: Session,
    *,
    name: str,
    email: str,
    phone: str | None,
    password: str,
    status: str = STATUS_PENDING_VERIFICATION,
    email_verified: bool = False,
    phone_verified: bool = False,
    supabase_uid: str | None = None,
) -> Identity:
    conflict = _contact_conflict(db, email, phone)
    if conflict:
        raise HTTPException(status_code=400, detail=conflict)
    identity = Identity(
        name=name.strip(),
        email=email.strip().lower(),
        phone=phone,
        password_hash=hash_password(password),
        status=status,
        email_verified=email_verified,
        phone_verified=phone_verified,
    )
    db.add(identity)
    db.flush()
    if supabase_uid:
        # Keep the legacy column populated for existing Supabase code paths.
        pass
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="registered",
        details={"email": identity.email, "phone": identity.phone},
    )
    return identity


def create_customer_profile(db: Session, identity: Identity, *, address: str | None = None, profile_photo: str | None = None) -> User:
    profile = User(
        identity_id=identity.id,
        name=identity.name,
        email=identity.email,
        phone=identity.phone,
        address=address,
        profile_photo=profile_photo,
        password_hash=identity.password_hash,
        role="user",
        account_status=identity.status,
        is_active=True,
        is_verified=identity.email_verified,
        supabase_uid=None,
    )
    db.add(profile)
    db.flush()
    ensure_role(db, identity.id, ROLE_CUSTOMER, status=ROLE_APPROVED)
    return profile


def _get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if _profile_status(user) in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raise HTTPException(status_code=403, detail="This account is not active")
    return user


def _normalize_identifier(value: str | None) -> str:
    return (value or "").strip()


def _normalize_email(value: str | None) -> str:
    return _normalize_identifier(value).lower()


def _normalize_phone(value: str | None) -> str | None:
    """Normalize a phone number for comparison/lookup.

    Tries to canonicalize to the same +255XXXXXXXXX format that
    validate_phone_format() stores at registration time, so an exact `==`
    DB lookup at login works regardless of how the user types their phone
    (0712345678, 255712345678, or +255712345678 should all match the same
    stored account). Previously this just stripped to digits-only
    (255700002001), which no longer matched the canonical +255-prefixed
    format registration now stores -- phone login was silently broken for
    every account type, while email login kept working, which is why it
    went unnoticed. Falls back to a plain digit-only strip for anything
    that doesn't match the Tanzanian pattern, preserving old fuzzy-matching
    behavior for legacy/malformed data rather than failing outright.
    """
    raw = value or ""
    digits_only = "".join(ch for ch in raw if ch.isdigit())
    if not digits_only:
        return None

    match = re.fullmatch(r"(?:255|0)(\d{9})", digits_only)
    if match:
        return f"+255{match.group(1)}"

    return digits_only


def _phone_matches(stored: str | None, provided: str | None) -> bool:
    stored_digits = _normalize_phone(stored)
    provided_digits = _normalize_phone(provided)
    return bool(stored_digits and provided_digits and stored_digits == provided_digits)


def _find_recovery_account(db: Session, identifier: str):
    lookup = _normalize_identifier(identifier)
    if not lookup:
        return None, None

    lowered = lookup.lower()
    normalized_phone = _normalize_phone(lookup)

    if "@" in lookup:
        user = db.query(User).filter(func.lower(User.email) == lowered).first()
        if user and user.is_active:
            user.role = _normalize_role(user.role)
            return "user", user

        business = db.query(BusinessUser).filter(func.lower(BusinessUser.email) == lowered).first()
        if business and business.is_active:
            business.role = _normalize_role(business.role)
            return "business", business

        logistics = db.query(LogisticsUser).filter(func.lower(LogisticsUser.email) == lowered).first()
        if logistics and logistics.is_active:
            logistics.role = "logistics"
            return "logistics", logistics

    if normalized_phone:
        users = db.query(User).filter(User.phone.isnot(None)).all()
        for user in users:
            if _phone_matches(user.phone, normalized_phone) and user.is_active:
                user.role = _normalize_role(user.role)
                return "user", user

        businesses = db.query(BusinessUser).filter(BusinessUser.phone.isnot(None)).all()
        for business in businesses:
            if _phone_matches(business.phone, normalized_phone) and business.is_active:
                business.role = _normalize_role(business.role)
                return "business", business

        logistics = db.query(LogisticsUser).filter(LogisticsUser.phone.isnot(None)).all()
        for logistics_user in logistics:
            if _phone_matches(logistics_user.phone, normalized_phone) and logistics_user.is_active:
                logistics_user.role = "logistics"
                return "logistics", logistics_user

    return None, None


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User | BusinessUser | LogisticsUser:
    user = get_optional_current_user(request, credentials, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _attach_role_context(db: Session, profile, payload: dict):
    identity_id = payload.get("identity_id")
    if identity_id:
        try:
            identity_id = int(identity_id)
        except (TypeError, ValueError):
            identity_id = None
        if identity_id:
            identity = db.query(Identity).filter(Identity.id == identity_id).first()
            if identity is None:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            status = str(identity.status or "").strip().upper()
            if status in {STATUS_SUSPENDED, STATUS_DISABLED}:
                raise HTTPException(status_code=403, detail="This account is not active")
            active = canonical_role(payload.get("active_role")) or profile_role(profile, payload.get("user_type"))
            if not role_is_approved(db, identity.id, active):
                raise HTTPException(status_code=403, detail="Role access has been revoked")
            profile.role = legacy_role(active)
            profile.active_role = active
            profile.roles = approved_role_names(db, identity.id)
            profile.identity_id = identity.id
        return profile

    role = canonical_role(payload.get("active_role")) or canonical_role(payload.get("role"))
    profile.role = legacy_role(role) if role else _normalize_role(getattr(profile, "role", None))
    return profile


def _resolve_user_from_payload(
    db: Session,
    payload: dict,
) -> User | BusinessUser | LogisticsUser:
    if payload.get("user_type") == "superadmin" or str(payload.get("sub", "")) == "0":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_type = payload.get("user_type")
    if user_type == "business":
        user_id = payload.get("user_id") or payload.get("sub")
        business = None
        if user_id is not None:
            try:
                business = db.query(BusinessUser).filter(BusinessUser.id == int(user_id)).first()
            except (TypeError, ValueError):
                business = None
        if not business or not business.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if _profile_status(business) in {STATUS_SUSPENDED, STATUS_DISABLED}:
            raise HTTPException(status_code=403, detail="This account is not active")
        return _attach_role_context(db, business, payload)

    if user_type == "logistics":
        user_id = payload.get("user_id") or payload.get("sub")
        logistics = None
        if user_id is not None:
            try:
                logistics = db.query(LogisticsUser).filter(LogisticsUser.id == int(user_id)).first()
            except (TypeError, ValueError):
                logistics = None
        if not logistics or not logistics.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if _profile_status(logistics) in {STATUS_SUSPENDED, STATUS_DISABLED}:
            raise HTTPException(status_code=403, detail="This account is not active")
        return _attach_role_context(db, logistics, payload)

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = _get_user_by_id(db, int(user_id))
    return _attach_role_context(db, user, payload)


def get_optional_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User | BusinessUser | LogisticsUser | None:
    token = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    elif "access_token" in request.cookies:
        token = request.cookies["access_token"]

    if not token:
        return None

    # 1. Try the existing app JWT (signed with APP_SECRET_KEY)
    try:
        payload = decode_token(token, db)
        return _resolve_user_from_payload(db, payload)
    except HTTPException as exc:
        if exc.status_code == 403:
            raise
    except Exception:
        pass

    # 2. Fall back to Supabase Auth JWT
    try:
        from backend.services.identity.supabase_auth import verify_supabase_token, _resolve_app_user, _ensure_supabase_uid
        payload = verify_supabase_token(token)
        user = _resolve_app_user(db, payload)
        _ensure_supabase_uid(db, user, str(payload.get("sub", "")))
        return user
    except HTTPException:
        return None
    except Exception:
        return None


def get_user_from_token(
    token: str,
    db: Session | None = None,
) -> User | BusinessUser | LogisticsUser | None:
    """Extract user from JWT token without requiring FastAPI dependencies.

    Tries the app JWT first; falls back to Supabase Auth JWT.
    """
    if db is None:
        from backend.shared.database import SessionLocal
        db = SessionLocal()
        close_db = True
    else:
        close_db = False

    try:
        # 1. Try app JWT
        try:
            payload = decode_token(token, db)
            return _resolve_user_from_payload(db, payload)
        except Exception:
            pass

        # 2. Try Supabase JWT
        from backend.services.identity.supabase_auth import verify_supabase_token, _resolve_app_user, _ensure_supabase_uid
        payload = verify_supabase_token(token)
        user = _resolve_app_user(db, payload)
        _ensure_supabase_uid(db, user, str(payload.get("sub", "")))
        return user
    except Exception:
        return None
    finally:
        if close_db:
            db.close()


def require_roles(*allowed: str):
    allowed_set = {_normalize_role(role) for role in allowed}

    def checker(user=Depends(get_current_user)):
        role = _normalize_role(user.role)
        user.role = role
        # A superadmin is intentionally more privileged than an administrator.
        # Seller/logistics/customer roles are never implicitly promoted.
        if role == "super_admin" and "admin" in allowed_set:
            return user
        if role not in allowed_set:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return checker


@router.post("/password-recovery/request")
@limiter.limit("3/minute")
def request_password_recovery(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    identifier = (payload.get("identifier") or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Please enter your email or phone number")

    response = {
        "message": "If an account matches the provided details, password recovery instructions are ready."
    }

    lookup = _normalize_identifier(identifier)
    lowered = lookup.lower()
    normalized_phone = _normalize_phone(lookup)

    identity = None
    if "@" in lookup:
        identity = db.query(Identity).filter(func.lower(Identity.email) == lowered).first()
    if identity is None and normalized_phone:
        identity = db.query(Identity).filter(Identity.phone == normalized_phone).first()

    # Legacy account fallback: attach it to an identity before issuing a token.
    if identity is None:
        account_type, account = _find_recovery_account(db, identifier)
        if account is not None:
            identity = ensure_identity_for_profile(db, account, account_type)
            db.flush()

    if identity is not None and identity.status not in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raw, _ = issue_verification_token(
            db,
            identity.id,
            purpose="password_reset",
            channel="email",
            ttl_seconds=PASSWORD_RESET_TTL_SECONDS,
        )
        reset_url = _identity_url("/forgot-password", raw)
        if not smtp_enabled() and not IS_PRODUCTION:
            logger.warning("SMTP is not configured; password reset link for %s: %s", identity.email, reset_url)
        body = (
            f"Hello {identity.name},\n\n"
            "A password reset was requested for your SokoLink account.\n\n"
            f"Reset password: {reset_url}\n\n"
            "This link expires in 30 minutes. If you did not request this, ignore this message.\n\n"
            "SokoLink Support"
        )
        _notify_identity(
            db,
            identity,
            background_tasks,
            title="Password reset requested",
            message="Password reset instructions are ready for your account.",
            subject="SokoLink password reset instructions",
            body=body,
            severity="warning",
            action_href="/forgot-password",
        )
        audit(
            db,
            actor_type="identity",
            actor_id=identity.id,
            entity_type="identity",
            entity_id=identity.id,
            action="password_reset_requested",
        )
        db.commit()

    return response


@router.post("/password-recovery/reset")
@limiter.limit("3/minute")
def reset_password_recovery(request: Request, payload: dict, db: Session = Depends(get_db)):
    token = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or ""

    if not token:
        raise HTTPException(status_code=400, detail="Reset token is required")
    validate_password_strength(new_password)

    record = consume_verification_token(db, token, purpose="password_reset", channel="email")
    if record:
        identity = db.query(Identity).filter(Identity.id == record.identity_id).first()
        if not identity or identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
            raise HTTPException(status_code=400, detail="We could not reset the password for this account")
        record.used_at = utcnow()
        password_hash = hash_password(new_password)
        identity.password_hash = password_hash
        db.add(record)
        db.add(identity)
        for model in (User, BusinessUser, LogisticsUser):
            for profile in db.query(model).filter(model.identity_id == identity.id).all():
                profile.password_hash = password_hash
                db.add(profile)
        db.query(RefreshToken).filter(
            RefreshToken.identity_id == identity.id,
            RefreshToken.is_revoked == False,  # noqa: E712
        ).update({RefreshToken.is_revoked: True, RefreshToken.revoked_at: utcnow()}, synchronize_session=False)
        audit(
            db,
            actor_type="identity",
            actor_id=identity.id,
            entity_type="identity",
            entity_id=identity.id,
            action="password_reset_completed",
        )
        db.commit()
        return {"message": "Password reset successful. You can now sign in with your new password."}

    # Accept unexpired reset JWTs issued before the hashed-token migration.
    try:
        decoded = decode_token(token, db)
    except HTTPException:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    if decoded.get("purpose") != "password_recovery":
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    account_type = decoded.get("account_type")
    account_id = decoded.get("user_id") or decoded.get("sub")
    try:
        account_id = int(account_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    if account_type == "business":
        account = db.query(BusinessUser).filter(BusinessUser.id == account_id).first()
    elif account_type == "logistics":
        account = db.query(LogisticsUser).filter(LogisticsUser.id == account_id).first()
    else:
        account = db.query(User).filter(User.id == account_id).first()

    if not account or not account.is_active:
        raise HTTPException(status_code=400, detail="We could not reset the password for this account")

    account.password_hash = hash_password(new_password)
    db.add(account)
    jti = decoded.get("jti")
    if jti:
        db.add(TokenBlocklist(jti=jti))
    db.commit()
    return {"message": "Password reset successful. You can now sign in with your new password."}


@router.post("/register")
@limiter.limit("5/minute")
def register(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
):
    from backend.services.identity.supabase_auth import extract_supabase_uid_from_request
    supabase_uid = extract_supabase_uid_from_request(request, db)

    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    password = payload.get("password") or ""
    address = (payload.get("address") or "").strip() or None
    profile_photo = (payload.get("profile_photo") or "").strip() or None

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    phone = validate_phone_format(phone)
    validate_password_strength(password)

    identity = create_identity(
        db,
        name=name,
        email=email,
        phone=phone,
        password=password,
        status=STATUS_PENDING_VERIFICATION,
        email_verified=False,
        phone_verified=False,
    )
    profile = create_customer_profile(
        db,
        identity,
        address=address,
        profile_photo=profile_photo,
    )
    if supabase_uid:
        profile.supabase_uid = supabase_uid
        db.add(profile)
    db.flush()
    _send_email_verification(db, identity, background_tasks)
    db.commit()

    return {
        "message": "Account created. Check your email to verify your address before signing in.",
        "verification_required": True,
        "email_verification_required": True,
        "user": _serialize_profile(profile, "user", ROLE_CUSTOMER, [ROLE_CUSTOMER]),
    }


@router.post("/register-customer")
@limiter.limit("5/minute")
def register_customer(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
):
    from backend.services.identity.supabase_auth import extract_supabase_uid_from_request
    supabase_uid = extract_supabase_uid_from_request(request, db)

    name = (payload.get("name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    location = (payload.get("location") or "").strip() or None
    profile_photo = (payload.get("profile_photo") or "").strip() or None

    if not name or not phone or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email, phone and password are required")
    validate_password_strength(password)
    phone = validate_phone_format(phone)

    identity = create_identity(
        db,
        name=name,
        email=email,
        phone=phone,
        password=password,
        status=STATUS_PENDING_VERIFICATION,
    )
    profile = create_customer_profile(
        db,
        identity,
        address=location,
        profile_photo=profile_photo,
    )
    if supabase_uid:
        profile.supabase_uid = supabase_uid
        db.add(profile)
    db.flush()
    _send_email_verification(db, identity, background_tasks)
    db.commit()

    return {
        "message": "Account created. Check your email to verify your address before signing in.",
        "verification_required": True,
        "email_verification_required": True,
        "user": _serialize_profile(profile, "user", ROLE_CUSTOMER, [ROLE_CUSTOMER]),
    }


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
):
    email = _normalize_email(payload.get("email"))
    phone = _normalize_phone(payload.get("phone"))
    password = payload.get("password") or ""

    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Email or phone is required")

    requested_role = canonical_role(payload.get("active_role") or payload.get("role"))
    if not requested_role:
        requested_role = {
            "business": ROLE_SELLER,
            "logistics": ROLE_LOGISTICS_PROVIDER,
        }.get(str(payload.get("user_type") or "").lower())

    identity = None
    if email:
        identity = db.query(Identity).filter(func.lower(Identity.email) == email).first()
    if identity is None and phone:
        identity = db.query(Identity).filter(Identity.phone == phone).first()

    if identity is not None:
        if not verify_password(password, identity.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        _assert_identity_login_allowed(identity)
        result = _issue_identity_session(response, db, identity, requested_role)
        role_label = legacy_role(result["active_role"])
        _notify_identity(
            db,
            identity,
            background_tasks,
            title="Login detected",
            message=f"A new login was recorded for your {role_label} account.",
            subject=f"SokoLink login alert for your {role_label} account",
            body=(
                f"Hello {identity.name},\n\n"
                f"Your {role_label} account just signed in to SokoLink.\n"
                f"Time: {utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
                f"IP/Host: {request.client.host if request.client else 'Unavailable'}\n"
                f"Device: {request.headers.get('user-agent') or 'Unknown device'}\n\n"
                "If this was not you, reset your password immediately.\n\nSokoLink Security"
            ),
            action_href="/app/profile",
        )
        audit(
            db,
            actor_type="identity",
            actor_id=identity.id,
            entity_type="identity",
            entity_id=identity.id,
            action="login",
            details={"role": result["active_role"]},
        )
        db.commit()
        return result

    # Backward compatibility for accounts created before unified identities.
    user = None
    user_type = "user"
    if email:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            user = db.query(BusinessUser).filter(func.lower(BusinessUser.email) == email).first()
            user_type = "business"
        if not user:
            user = db.query(LogisticsUser).filter(func.lower(LogisticsUser.email) == email).first()
            user_type = "logistics"
    elif phone:
        user = db.query(User).filter(User.phone == phone).first()
        if not user:
            user = db.query(BusinessUser).filter(BusinessUser.phone == phone).first()
            user_type = "business"
        if not user:
            user = db.query(LogisticsUser).filter(LogisticsUser.phone == phone).first()
            user_type = "logistics"

    if not user or not verify_and_upgrade_password(password, user):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if _profile_status(user) in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raise HTTPException(status_code=403, detail="Account is disabled")

    identity = ensure_identity_for_profile(db, user, user_type)
    db.flush()
    result = _issue_identity_session(response, db, identity, requested_role)
    role_label = legacy_role(result["active_role"])
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Login detected",
        message=f"A new login was recorded for your {role_label} account.",
        subject=f"SokoLink login alert for your {role_label} account",
        body=(
            f"Hello {identity.name},\n\n"
            f"Your {role_label} account just signed in to SokoLink.\n"
            f"Time: {utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            f"IP/Host: {request.client.host if request.client else 'Unavailable'}\n"
            f"Device: {request.headers.get('user-agent') or 'Unknown device'}\n\n"
            "If this was not you, reset your password immediately.\n\nSokoLink Security"
        ),
        action_href="/app/profile",
    )
    audit(
        db,
        actor_type=user_type,
        actor_id=user.id,
        entity_type="identity",
        entity_id=identity.id,
        action="legacy_login_linked",
    )
    db.commit()
    return result


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    db_token = db.query(RefreshToken).filter(
        RefreshToken.token == refresh_token,
        RefreshToken.is_revoked == False,  # noqa: E712
        RefreshToken.expires_at > datetime.now(timezone.utc),
    ).first()

    if not db_token:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = None
    if db_token.user_type == "business":
        user = db.query(BusinessUser).filter(BusinessUser.id == db_token.user_id).first()
    elif db_token.user_type == "logistics":
        user = db.query(LogisticsUser).filter(LogisticsUser.id == db_token.user_id).first()
    else:
        user = db.query(User).filter(User.id == db_token.user_id).first()

    if not user or not getattr(user, "is_active", True):
        db_token.is_revoked = True
        db_token.revoked_at = utcnow()
        db.commit()
        raise HTTPException(status_code=401, detail="User account disabled")

    identity = None
    identity_id = db_token.identity_id or getattr(user, "identity_id", None)
    if identity_id:
        identity = db.query(Identity).filter(Identity.id == identity_id).first()
        if identity is None or identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
            db_token.is_revoked = True
            db_token.revoked_at = utcnow()
            db.commit()
            raise HTTPException(status_code=401, detail="User account disabled")

    canonical = canonical_role(db_token.active_role) or profile_role(user, db_token.user_type)
    if identity is not None:
        if not role_is_approved(db, identity.id, canonical):
            db_token.is_revoked = True
            db_token.revoked_at = utcnow()
            db.commit()
            raise HTTPException(status_code=403, detail="Role access has been revoked")
        roles = approved_role_names(db, identity.id)
    else:
        roles = [canonical]

    role = legacy_role(canonical)
    new_access_token = create_access_token(
        data={
            "sub": user.id,
            "user_id": user.id,
            "identity_id": identity.id if identity else None,
            "role": role,
            "active_role": canonical,
            "roles": roles,
            "email": getattr(user, "email", None),
            "phone": getattr(user, "phone", None),
            "user_type": db_token.user_type,
        }
    )

    # Rotate refresh tokens: the old token is single-use.
    db_token.is_revoked = True
    db_token.revoked_at = utcnow()
    db.add(db_token)
    new_refresh_token = create_refresh_token(
        user.id,
        db_token.user_type,
        db,
        identity_id=identity.id if identity else None,
        active_role=canonical,
    )
    set_auth_cookies(response, new_access_token, new_refresh_token)
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "roles": roles,
        "active_role": canonical,
        "user": _serialize_profile(user, db_token.user_type, canonical, roles),
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        db_token = db.query(RefreshToken).filter(RefreshToken.token == refresh_token).first()
        if db_token:
            db_token.is_revoked = True
            db.commit()
            
    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            payload = jwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti")
            if jti:
                db.add(TokenBlocklist(jti=jti))
                db.commit()
        except:
            pass
            
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/verify-email")
def verify_email(payload: dict, db: Session = Depends(get_db)):
    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required")

    record = consume_verification_token(db, token, purpose="email_verification", channel="email")
    if record:
        identity = db.query(Identity).filter(Identity.id == record.identity_id).first()
        if not identity:
            raise HTTPException(status_code=400, detail="Invalid verification token")
        identity.email_verified = True
        if identity.status == STATUS_PENDING_VERIFICATION:
            identity.status = STATUS_ACTIVE
        record.used_at = utcnow()
        db.add(record)
        db.add(identity)
        for model in (User, BusinessUser, LogisticsUser):
            for profile in db.query(model).filter(model.identity_id == identity.id).all():
                profile.is_verified = True
                profile.verification_token = None
                if profile.account_status == STATUS_PENDING_VERIFICATION:
                    profile.account_status = identity.status
                db.add(profile)
        invalidate_verification_tokens(
            db,
            identity.id,
            purposes={"email_verification", EMAIL_VERIFICATION_OTP_PURPOSE},
            channel="email",
        )
        audit(
            db,
            actor_type="identity",
            actor_id=identity.id,
            entity_type="identity",
            entity_id=identity.id,
            action="email_verified",
        )
        db.commit()
        return {"message": "Email verified successfully", "status": identity.status}

    # Older accounts used a raw verification_token column.
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        user = db.query(BusinessUser).filter(BusinessUser.verification_token == token).first()
    if not user:
        user = db.query(LogisticsUser).filter(LogisticsUser.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    user.is_verified = True
    user.verification_token = None
    db.add(user)
    db.commit()
    return {"message": "Email verified successfully"}


@router.post("/verify-email-otp")
@limiter.limit("10/minute")
def verify_email_otp(request: Request, payload: dict, db: Session = Depends(get_db)):
    email = _normalize_email(payload.get("email"))
    otp = str(payload.get("otp") or payload.get("token") or "").strip()
    invalid = HTTPException(status_code=400, detail="Invalid or expired verification code")
    if not email or not re.fullmatch(r"\d{6}", otp):
        raise invalid

    identity = db.query(Identity).filter(func.lower(Identity.email) == email).first()
    if not identity or identity.email_verified or identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raise invalid

    record = consume_identity_otp(
        db,
        identity.id,
        otp,
        purpose=EMAIL_VERIFICATION_OTP_PURPOSE,
        channel="email",
        max_attempts=EMAIL_OTP_MAX_ATTEMPTS,
    )
    if not record:
        db.commit()
        raise invalid

    identity.email_verified = True
    if identity.status == STATUS_PENDING_VERIFICATION:
        identity.status = STATUS_ACTIVE
    db.add(identity)
    for model in (User, BusinessUser, LogisticsUser):
        for profile in db.query(model).filter(model.identity_id == identity.id).all():
            profile.is_verified = True
            profile.verification_token = None
            if profile.account_status == STATUS_PENDING_VERIFICATION:
                profile.account_status = identity.status
            db.add(profile)
    invalidate_verification_tokens(
        db,
        identity.id,
        purposes={"email_verification", EMAIL_VERIFICATION_OTP_PURPOSE},
        channel="email",
    )
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="email_otp_verified",
    )
    db.commit()
    return {
        "message": "Email verified successfully",
        "status": identity.status,
        "email_verified": True,
    }


@router.post("/verify-email/resend")
@limiter.limit("3/minute")
def resend_email_verification(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = _normalize_email(payload.get("email"))
    response = {"message": "If the account exists and needs verification, a new email has been sent."}
    if not email:
        return response
    identity = db.query(Identity).filter(func.lower(Identity.email) == email).first()
    if not identity or identity.email_verified or identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
        return response
    _send_email_verification(db, identity, background_tasks)
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="verification_email_resent",
    )
    db.commit()
    return response


@router.post("/phone/send-otp")
@limiter.limit("3/minute")
def send_phone_otp(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    phone = _normalize_phone(payload.get("phone"))
    response = {"message": "If the number belongs to an account, a verification code has been sent."}
    if not phone:
        return response
    identity = db.query(Identity).filter(Identity.phone == phone).first()
    if not identity or identity.phone_verified or identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
        return response
    _send_phone_otp(db, identity, background_tasks)
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="phone_otp_requested",
    )
    db.commit()
    return response


@router.post("/phone/verify-otp")
@limiter.limit("5/minute")
def verify_phone_otp(request: Request, payload: dict, db: Session = Depends(get_db)):
    phone = _normalize_phone(payload.get("phone"))
    otp = str(payload.get("otp") or payload.get("token") or "").strip()
    if not phone or not otp:
        raise HTTPException(status_code=400, detail="Phone and verification code are required")
    identity = db.query(Identity).filter(Identity.phone == phone).first()
    if not identity:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    record = consume_verification_token(db, otp, purpose="phone_verification", channel="phone")
    if not record or record.identity_id != identity.id:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    record.used_at = utcnow()
    identity.phone_verified = True
    if identity.email_verified and identity.status == STATUS_PENDING_VERIFICATION:
        identity.status = STATUS_ACTIVE
    db.add(record)
    db.add(identity)
    profile = default_profile(db, identity.id)
    if profile is not None:
        profile.is_verified = True
        db.add(profile)
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="phone_verified",
    )
    db.commit()
    return {"message": "Phone number verified successfully", "phone_verified": True}


@router.get("/me")
def me(current=Depends(get_current_user)):
    active_role = getattr(current, "active_role", None) or profile_role(current)
    return {
        "id": current.id,
        "name": getattr(current, "name", getattr(current, "business_name", "User")),
        "email": getattr(current, "email", None),
        "phone": current.phone,
        "address": getattr(current, "address", None),
        "profile_photo": getattr(current, "profile_photo", None),
        "role": legacy_role(active_role),
        "active_role": active_role,
        "roles": getattr(current, "roles", [active_role]),
        "user_type": profile_user_type(current),
        "account_status": _profile_status(current),
        "is_verified": bool(getattr(current, "is_verified", False)),
    }


def _identity_for_current(db: Session, current) -> Identity:
    if getattr(current, "id", None) == 0 and getattr(current, "role", None) == "super_admin":
        raise HTTPException(status_code=400, detail="Superadmin has no switchable identity profile")
    identity = None
    if getattr(current, "identity_id", None):
        identity = db.query(Identity).filter(Identity.id == current.identity_id).first()
    if identity is None:
        identity = ensure_identity_for_profile(db, current, profile_user_type(current))
        db.flush()
    return identity


def _find_or_create_user_profile(db: Session, identity: Identity) -> User:
    profile = db.query(User).filter(User.identity_id == identity.id).first()
    if profile is None:
        profile = db.query(User).filter(func.lower(User.email) == identity.email.lower()).first()
        if profile is not None and profile.identity_id is None:
            profile.identity_id = identity.id
        else:
            profile = User(
                identity_id=identity.id,
                name=identity.name,
                email=identity.email,
                phone=identity.phone,
                password_hash=identity.password_hash,
                role="user",
                account_status=identity.status,
                is_active=True,
                is_verified=identity.email_verified,
            )
            db.add(profile)
    db.flush()
    return profile


def _create_profile_from_application(db: Session, identity: Identity, application: RoleApplication):
    payload = {}
    if application.payload_json:
        try:
            payload = json.loads(application.payload_json) or {}
        except json.JSONDecodeError:
            payload = {}

    if application.role == ROLE_SELLER:
        profile = db.query(BusinessUser).filter(BusinessUser.identity_id == identity.id).first()
        if profile is None:
            profile = db.query(BusinessUser).filter(BusinessUser.phone == identity.phone).first()
            if profile is not None and profile.identity_id is None:
                profile.identity_id = identity.id
            else:
                profile = BusinessUser(
                    identity_id=identity.id,
                    business_name=(payload.get("business_name") or identity.name).strip(),
                    owner_name=(payload.get("owner_name") or identity.name).strip(),
                    phone=identity.phone,
                    email=identity.email,
                    password_hash=identity.password_hash,
                    business_type=(payload.get("business_type") or "individual").strip() or "individual",
                    category=(payload.get("category") or "").strip() or None,
                    description=(payload.get("description") or "").strip() or None,
                    region=(payload.get("region") or "Dar es Salaam").strip() or "Dar es Salaam",
                    area=(payload.get("area") or "").strip() or None,
                    street=(payload.get("street") or "").strip() or None,
                    shop_number=(payload.get("shop_number") or "").strip() or None,
                    operating_hours=(payload.get("operating_hours") or "").strip() or None,
                    role="seller",
                    account_status=STATUS_ACTIVE,
                    is_active=True,
                    is_verified=identity.email_verified,
                    verification_status="verified",
                )
                db.add(profile)
                db.flush()
                db.add(BusinessMetrics(business_id=profile.id))
        profile.verification_status = "verified"
        profile.account_status = STATUS_ACTIVE
        profile.is_active = True
        db.add(profile)
        return profile

    if application.role == ROLE_LOGISTICS_PROVIDER:
        profile = db.query(LogisticsUser).filter(LogisticsUser.identity_id == identity.id).first()
        if profile is None:
            profile = db.query(LogisticsUser).filter(LogisticsUser.phone == identity.phone).first()
            if profile is not None and profile.identity_id is None:
                profile.identity_id = identity.id
            else:
                profile = LogisticsUser(
                    identity_id=identity.id,
                    name=(payload.get("name") or identity.name).strip(),
                    phone=identity.phone,
                    email=identity.email,
                    password_hash=identity.password_hash,
                    account_type=(payload.get("account_type") or "individual").strip() or "individual",
                    vehicle_type=(payload.get("vehicle_type") or "").strip() or None,
                    plate_number=(payload.get("plate_number") or "").strip() or None,
                    license_number=(payload.get("license_number") or "").strip() or None,
                    base_area=(payload.get("base_area") or "").strip() or None,
                    coverage_areas=(payload.get("coverage_areas") or "").strip() or None,
                    role="logistics",
                    account_status=STATUS_ACTIVE,
                    is_active=True,
                    is_verified=identity.email_verified,
                    verification_status="verified",
                )
                db.add(profile)
                db.flush()
                db.add(LogisticsMetrics(logistics_id=profile.id))
        profile.verification_status = "verified"
        profile.account_status = STATUS_ACTIVE
        profile.is_active = True
        db.add(profile)
        return profile

    raise HTTPException(status_code=400, detail="Unsupported role application")


@router.get("/roles")
def list_my_roles(db: Session = Depends(get_db), current=Depends(get_current_user)):
    identity = _identity_for_current(db, current)
    rows = roles_for_identity(db, identity.id, approved_only=False)
    result = []
    for row in rows:
        profile = profile_for_role(db, identity.id, row.role)
        result.append(
            {
                "role": row.role,
                "status": row.status,
                "has_profile": profile is not None,
            }
        )
    return {
        "identity": serialize_identity(db, identity),
        "active_role": getattr(current, "active_role", None) or profile_role(current),
        "roles": result,
    }


@router.post("/switch-role")
def switch_role(
    payload: dict,
    response: Response,
    db: Session = Depends(get_db),
    current=Depends(get_current_user),
):
    identity = _identity_for_current(db, current)
    requested = canonical_role(payload.get("role") or payload.get("active_role"))
    if requested not in PUBLIC_ROLES | {ROLE_SUPER_ADMIN}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if identity.status in {STATUS_SUSPENDED, STATUS_DISABLED}:
        raise HTTPException(status_code=403, detail="This account is not active")
    result = _issue_identity_session(response, db, identity, requested)
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="identity",
        entity_id=identity.id,
        action="role_switched",
        details={"role": requested},
    )
    db.commit()
    return result


@router.get("/applications")
def list_my_applications(db: Session = Depends(get_db), current=Depends(get_current_user)):
    identity = _identity_for_current(db, current)
    rows = (
        db.query(RoleApplication)
        .filter(RoleApplication.identity_id == identity.id)
        .order_by(RoleApplication.created_at.desc(), RoleApplication.id.desc())
        .all()
    )
    return [serialize_role_application(item) for item in rows]


@router.post("/applications")
def submit_role_application(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current=Depends(get_current_user),
):
    role = canonical_role(payload.get("role"))
    if role not in APPLICATION_ROLES:
        raise HTTPException(status_code=400, detail="Only seller and logistics applications are supported")
    identity = _identity_for_current(db, current)
    existing_role = (
        db.query(IdentityRole)
        .filter(IdentityRole.identity_id == identity.id, IdentityRole.role == role)
        .first()
    )
    if existing_role and existing_role.status in {ROLE_APPROVED, ROLE_SUSPENDED}:
        raise HTTPException(status_code=400, detail="This role is already assigned to your account")
    pending = (
        db.query(RoleApplication)
        .filter(
            RoleApplication.identity_id == identity.id,
            RoleApplication.role == role,
            RoleApplication.status == ROLE_PENDING,
        )
        .first()
    )
    if pending:
        raise HTTPException(status_code=409, detail="You already have a pending application for this role")

    details = {key: value for key, value in payload.items() if key not in {"role"}}
    application = RoleApplication(
        identity_id=identity.id,
        role=role,
        status=ROLE_PENDING,
        payload_json=json.dumps(details) if details else None,
    )
    db.add(application)
    ensure_role(db, identity.id, role, status=ROLE_PENDING)
    audit(
        db,
        actor_type="identity",
        actor_id=identity.id,
        entity_type="role_application",
        entity_id=None,
        action="submitted",
        details={"role": role},
    )
    db.commit()
    db.refresh(application)
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Application received",
        message=f"Your {legacy_role(role)} application is pending administrator review.",
        subject="SokoLink role application received",
        body=f"Hello {identity.name},\n\nYour {legacy_role(role)} application is pending review.\n\nSokoLink Team",
        severity="info",
    )
    db.commit()
    return serialize_role_application(application)


def _admin_can_manage_privileged(current) -> bool:
    return _normalize_role(getattr(current, "role", None)) == "super_admin"


@router.get("/admin/applications")
def admin_list_role_applications(
    status: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "super_admin", "owner")),
):
    query = db.query(RoleApplication)
    if status:
        normalized = str(status).strip().upper()
        if normalized not in APPLICATION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid application status")
        query = query.filter(RoleApplication.status == normalized)
    rows = query.order_by(RoleApplication.created_at.desc(), RoleApplication.id.desc()).all()
    result = []
    for item in rows:
        data = serialize_role_application(item)
        identity = db.query(Identity).filter(Identity.id == item.identity_id).first()
        data["identity"] = serialize_identity(db, identity) if identity else None
        result.append(data)
    return result


@router.post("/admin/applications/{application_id}/approve")
def admin_approve_role_application(
    application_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current=Depends(require_roles("admin", "super_admin", "owner")),
):
    application = db.query(RoleApplication).filter(RoleApplication.id == application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Role application not found")
    if application.status != ROLE_PENDING:
        raise HTTPException(status_code=400, detail="Only pending applications can be approved")
    identity = db.query(Identity).filter(Identity.id == application.identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")
    if not identity.email_verified:
        raise HTTPException(status_code=400, detail="The applicant must verify their email first")

    profile = _create_profile_from_application(db, identity, application)
    application.status = ROLE_APPROVED
    application.reviewer_id = getattr(current, "id", None)
    application.reviewed_at = utcnow()
    ensure_role(db, identity.id, application.role, status=ROLE_APPROVED, approved_by=getattr(current, "id", None))
    db.add(application)
    audit(
        db,
        actor_type="admin",
        actor_id=getattr(current, "id", None),
        entity_type="role_application",
        entity_id=application.id,
        action="approved",
        details={"role": application.role, "identity_id": identity.id},
    )
    db.commit()
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Role application approved",
        message=f"Your {legacy_role(application.role)} role is now active.",
        subject="Your SokoLink role application was approved",
        body=f"Hello {identity.name},\n\nYour {legacy_role(application.role)} role has been approved. Sign in and switch to that workspace to get started.\n\nSokoLink Team",
        severity="success",
        action_href="/login",
    )
    db.commit()
    return {
        "message": "Application approved",
        "application": serialize_role_application(application),
        "profile_type": profile_user_type(profile),
    }


@router.post("/admin/applications/{application_id}/reject")
def admin_reject_role_application(
    application_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current=Depends(require_roles("admin", "super_admin", "owner")),
):
    application = db.query(RoleApplication).filter(RoleApplication.id == application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Role application not found")
    if application.status != ROLE_PENDING:
        raise HTTPException(status_code=400, detail="Only pending applications can be rejected")
    reason = (payload.get("reason") or "").strip() or None
    application.status = ROLE_REJECTED
    application.rejection_reason = reason
    application.reviewer_id = getattr(current, "id", None)
    application.reviewed_at = utcnow()
    ensure_role(db, application.identity_id, application.role, status=ROLE_REJECTED)
    audit(
        db,
        actor_type="admin",
        actor_id=getattr(current, "id", None),
        entity_type="role_application",
        entity_id=application.id,
        action="rejected",
        details={"role": application.role, "reason": reason},
    )
    identity = db.query(Identity).filter(Identity.id == application.identity_id).first()
    db.commit()
    if identity:
        _notify_identity(
            db,
            identity,
            background_tasks,
            title="Role application update",
            message=f"Your {legacy_role(application.role)} application was not approved.",
            subject="SokoLink role application update",
            body=f"Hello {identity.name},\n\nYour {legacy_role(application.role)} application was not approved."
                 + (f"\nReason: {reason}" if reason else "")
                 + "\n\nSokoLink Team",
            severity="warning",
        )
        db.commit()
    return {"message": "Application rejected", "application": serialize_role_application(application)}


@router.get("/admin/identities")
def admin_list_identities(
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin", "super_admin", "owner")),
):
    rows = db.query(Identity).order_by(Identity.created_at.desc(), Identity.id.desc()).limit(500).all()
    return [serialize_identity(db, item) for item in rows]


@router.post("/admin/identities/{identity_id}/roles")
def admin_assign_role(
    identity_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current=Depends(require_roles("admin", "super_admin", "owner")),
):
    identity = db.query(Identity).filter(Identity.id == identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")
    role = canonical_role(payload.get("role"))
    status = str(payload.get("status") or ROLE_APPROVED).strip().upper()
    if role not in PUBLIC_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if status not in {ROLE_APPROVED, ROLE_SUSPENDED, ROLE_REJECTED}:
        raise HTTPException(status_code=400, detail="Invalid role status")
    if role in {ROLE_ADMINISTRATOR, ROLE_ANALYST} and not _admin_can_manage_privileged(current):
        raise HTTPException(status_code=403, detail="Only a superadmin can assign administrator or analyst roles")
    if not identity.email_verified and status == ROLE_APPROVED:
        raise HTTPException(status_code=400, detail="The identity must verify their email first")

    if role == ROLE_SELLER or role == ROLE_LOGISTICS_PROVIDER:
        application = RoleApplication(
            identity_id=identity.id,
            role=role,
            status=ROLE_PENDING,
            payload_json=json.dumps({"source": "admin_assignment"}),
        )
        db.add(application)
        db.flush()
        _create_profile_from_application(db, identity, application)
        application.status = ROLE_APPROVED
        application.reviewer_id = getattr(current, "id", None)
        application.reviewed_at = utcnow()
        db.add(application)
    else:
        profile = _find_or_create_user_profile(db, identity)
        profile.role = legacy_role(role)
        profile.account_status = identity.status
        db.add(profile)

    ensure_role(db, identity.id, role, status=status, approved_by=getattr(current, "id", None))
    audit(
        db,
        actor_type="admin",
        actor_id=getattr(current, "id", None),
        entity_type="identity",
        entity_id=identity.id,
        action="role_assigned",
        details={"role": role, "status": status},
    )
    db.commit()
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Account role updated",
        message=f"An administrator updated your {legacy_role(role)} access.",
        subject="Your SokoLink account role was updated",
        body=f"Hello {identity.name},\n\nYour {legacy_role(role)} access is now: {status.lower()}.\n\nSokoLink Team",
        severity="info",
    )
    db.commit()
    return {"message": "Role updated", "identity": serialize_identity(db, identity)}


@router.patch("/admin/identities/{identity_id}/status")
def admin_update_identity_status(
    identity_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current=Depends(require_roles("admin", "super_admin", "owner")),
):
    identity = db.query(Identity).filter(Identity.id == identity_id).first()
    if not identity:
        raise HTTPException(status_code=404, detail="Identity not found")
    status = str(payload.get("status") or "").strip().upper()
    if status not in ACCOUNT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid account status")
    if getattr(current, "identity_id", None) == identity.id and status != STATUS_ACTIVE:
        raise HTTPException(status_code=400, detail="You cannot suspend your own account")
    if not _admin_can_manage_privileged(current):
        privileged_roles = {ROLE_ADMINISTRATOR, ROLE_ANALYST, ROLE_SUPER_ADMIN}
        has_privileged_role = (
            db.query(IdentityRole)
            .filter(
                IdentityRole.identity_id == identity.id,
                IdentityRole.role.in_(privileged_roles),
            )
            .first()
            is not None
        )
        if has_privileged_role:
            raise HTTPException(status_code=403, detail="Only a superadmin can change an administrator or analyst account status")

    identity.status = status
    db.add(identity)
    for model in (User, BusinessUser, LogisticsUser):
        for profile in db.query(model).filter(model.identity_id == identity.id).all():
            profile.account_status = status
            profile.is_active = status == STATUS_ACTIVE
            db.add(profile)
    if status in {STATUS_SUSPENDED, STATUS_DISABLED}:
        db.query(RefreshToken).filter(
            RefreshToken.identity_id == identity.id,
            RefreshToken.is_revoked == False,  # noqa: E712
        ).update({RefreshToken.is_revoked: True, RefreshToken.revoked_at: utcnow()}, synchronize_session=False)
    audit(
        db,
        actor_type="admin",
        actor_id=getattr(current, "id", None),
        entity_type="identity",
        entity_id=identity.id,
        action="status_updated",
        details={"status": status},
    )
    db.commit()
    _notify_identity(
        db,
        identity,
        background_tasks,
        title="Account status changed",
        message=f"Your account status is now {status.lower()}.",
        subject="Your SokoLink account status changed",
        body=f"Hello {identity.name},\n\nYour account status is now: {status.lower()}.\n\nSokoLink Team",
        severity="success" if status == STATUS_ACTIVE else "warning",
    )
    db.commit()
    return {"message": "Identity status updated", "identity": serialize_identity(db, identity)}


@router.put("/me")
def update_me(
    payload: dict,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    name = (payload.get("name") or getattr(current, "name", getattr(current, "business_name", ""))).strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")

    if hasattr(current, "name"):
        current.name = name
    elif hasattr(current, "business_name"):
        current.business_name = name

    phone_input = payload.get("phone")
    if phone_input is not None and str(phone_input).strip():
        new_phone = validate_phone_format(str(phone_input))
    else:
        new_phone = current.phone

    identity_id = getattr(current, "identity_id", None)
    if identity_id:
        identity = db.query(Identity).filter(Identity.id == identity_id).first()
        if identity:
            if new_phone != current.phone:
                conflict = _contact_conflict(db, None, new_phone, exclude_identity_id=identity.id)
                if conflict:
                    raise HTTPException(status_code=400, detail=conflict)
            identity.phone = new_phone
            if hasattr(current, "name"):
                identity.name = name
            db.add(identity)

    current.phone = new_phone
    if hasattr(current, "address"):
        current.address = payload.get("address")

    db.add(current)
    db.commit()
    db.refresh(current)
    return {"message": "Profile updated"}


@router.post("/upload-profile-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
):
    image_url = await save_uploaded_image(file)
    return {"image_url": image_url}


@router.post("/change-password")
@limiter.limit("3/minute")
def change_password(
    request: Request,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.id == 0 and current.role == "super_admin":
        raise HTTPException(status_code=400, detail="Superadmin password managed separately")
        
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    
    if not verify_password(current_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    validate_password_strength(new_password)

    password_hash = hash_password(new_password)
    current.password_hash = password_hash
    db.add(current)

    identity_id = getattr(current, "identity_id", None)
    if identity_id:
        identity = db.query(Identity).filter(Identity.id == identity_id).first()
        if identity:
            identity.password_hash = password_hash
            db.add(identity)
        for model in (User, BusinessUser, LogisticsUser):
            for profile in db.query(model).filter(model.identity_id == identity_id).all():
                profile.password_hash = password_hash
                db.add(profile)
        db.query(RefreshToken).filter(
            RefreshToken.identity_id == identity_id,
            RefreshToken.is_revoked == False,  # noqa: E712
        ).update({RefreshToken.is_revoked: True, RefreshToken.revoked_at: utcnow()}, synchronize_session=False)

    audit(
        db,
        actor_type="identity" if identity_id else profile_user_type(current),
        actor_id=getattr(current, "id", None),
        entity_type="identity",
        entity_id=identity_id or getattr(current, "id", None),
        action="password_changed",
    )
    recipient_type, recipient_id, recipient_email, recipient_name = resolve_subject(current)
    create_notification(
        db,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        recipient_email=recipient_email,
        title="Password changed",
        message="Your account password was changed successfully.",
        notification_type="security",
        severity="success",
        send_email=bool(recipient_email),
        email_subject="Password changed",
        email_body=f"Hello {recipient_name},\n\nYour password was changed.\n\nSokoLnk Security",
        background_tasks=background_tasks,
    )
    db.commit()
    return {"message": "Password updated"}


@router.post("/users")
def create_user(
    payload: dict,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role = _normalize_role(payload.get("role") or "user")
    if role not in {"user", "admin", "super_admin", "owner"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if role in {"super_admin", "owner"} and current.role not in {"super_admin", "owner"}:
        raise HTTPException(status_code=403, detail="Only super_admin/owner can create super_admin or owner")
    if not name or not email or len(password) < 8:
        raise HTTPException(status_code=400, detail="Invalid user payload")
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    identity = create_identity(
        db,
        name=name,
        email=email,
        phone=None,
        password=password,
        status=STATUS_ACTIVE,
        email_verified=True,
    )
    model = _find_or_create_user_profile(db, identity)
    model.role = legacy_role(role)
    model.account_status = STATUS_ACTIVE
    model.is_active = True
    model.is_verified = True
    ensure_role(db, identity.id, role, status=ROLE_APPROVED, approved_by=getattr(current, "id", None))
    db.add(model)
    db.commit()
    db.refresh(model)
    return {
        "id": model.id,
        "name": model.name,
        "email": model.email,
        "role": model.role,
        "is_active": model.is_active,
        "identity_id": identity.id,
    }


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    rows = db.query(User).order_by(User.id.asc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
        }
        for u in rows
    ]


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role in {"super_admin", "owner"} and _normalize_role(getattr(current, "role", None)) != "super_admin":
        raise HTTPException(status_code=403, detail="Only a superadmin can delete a superadmin account")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = str(payload.get("role") or user.role).strip().lower()
    if role not in {"user", "admin", "super_admin", "owner"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    privileged_target = user.role in {"super_admin", "owner"}
    privileged_change = role in {"super_admin", "owner"}
    if (privileged_target or privileged_change) and _normalize_role(getattr(current, "role", None)) != "super_admin":
        raise HTTPException(status_code=403, detail="Only a superadmin can manage superadmin accounts")

    is_active = payload.get("is_active")
    if is_active is not None:
        user.is_active = bool(is_active)

    user.role = role
    identity_id = getattr(user, "identity_id", None)
    if identity_id:
        identity = db.query(Identity).filter(Identity.id == identity_id).first()
        if identity:
            ensure_role(db, identity.id, role, status=ROLE_APPROVED, approved_by=getattr(current, "id", None))
            if is_active is not None and not is_active and identity.status == STATUS_ACTIVE:
                identity.status = STATUS_SUSPENDED
            elif is_active and identity.status == STATUS_SUSPENDED:
                identity.status = STATUS_ACTIVE
            db.add(identity)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "identity_id": identity_id,
    }


@router.post("/supabase/link")
def link_supabase_account(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Link the currently-authenticated app user to a Supabase Auth account.

    The frontend sends the Supabase access_token (obtained via supabase.auth).
    We verify it, store the supabase_uid, and return the linked user info.
    """
    supabase_token = payload.get("supabase_access_token") or ""
    if not supabase_token:
        raise HTTPException(status_code=400, detail="supabase_access_token is required")

    from backend.services.identity.supabase_auth import verify_supabase_token

    supabase_payload = verify_supabase_token(supabase_token)
    supabase_uid = str(supabase_payload.get("sub", ""))
    supabase_email = (supabase_payload.get("email") or "").strip().lower()

    # Prevent re-linking to a different Supabase account
    if getattr(current, "supabase_uid", None) and current.supabase_uid != supabase_uid:
        raise HTTPException(
            status_code=409,
            detail=f"Already linked to Supabase UID {current.supabase_uid}",
        )

    # Prevent two app users from linking the same Supabase UID
    for model_cls in (User, BusinessUser, LogisticsUser):
        existing = db.query(model_cls).filter(model_cls.supabase_uid == supabase_uid).first()
        if existing and existing.id != current.id:
            raise HTTPException(
                status_code=409,
                detail="This Supabase account is already linked to another user",
            )

    current.supabase_uid = supabase_uid
    # If the app user doesn't have an email yet, take it from Supabase
    if hasattr(current, "email") and not getattr(current, "email", None) and supabase_email:
        current.email = supabase_email
    db.add(current)
    db.commit()

    return {
        "message": "Supabase account linked",
        "supabase_uid": supabase_uid,
        "user": {
            "id": current.id,
            "name": getattr(current, "name", getattr(current, "business_name", "User")),
            "email": getattr(current, "email", None),
            "role": current.role,
        },
    }


@router.get("/supabase/me")
def supabase_me(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Endpoint callable with a Supabase JWT in the Authorization header.

    Returns app user info (creating a minimal record if the Supabase user
    has not yet been linked to an app account).
    """
    token = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    elif "access_token" in request.cookies:
        token = request.cookies["access_token"]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from backend.services.identity.supabase_auth import verify_supabase_token, _resolve_or_create_app_user, _ensure_supabase_uid, _resolve_user_type

    payload = verify_supabase_token(token)
    user_type = _resolve_user_type(payload)

    user = _resolve_or_create_app_user(db, payload)

    # If user exists but has no supabase_uid, link it now (auto-link)
    if getattr(user, "supabase_uid", None) is None:
        _ensure_supabase_uid(db, user, str(payload.get("sub", "")))

    return {
        "id": user.id,
        "name": getattr(user, "name", getattr(user, "business_name", "User")),
        "email": getattr(user, "email", None),
        "phone": getattr(user, "phone", None),
        "role": user.role,
        "user_type": user_type,
        "is_verified": getattr(user, "is_verified", True),
        "is_active": user.is_active,
    }
