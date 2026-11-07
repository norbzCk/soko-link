import json
import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from backend.shared.models import BusinessUser, LogisticsUser, Notification, User

logger = logging.getLogger(__name__)


SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USERNAME
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "SokoLnk")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false"
NOTIFICATION_INCLUDE_RESET_TOKEN = os.getenv("NOTIFICATION_INCLUDE_RESET_TOKEN", "true").strip().lower() != "false"


def smtp_enabled() -> bool:
    return bool(SMTP_HOST and SMTP_FROM_EMAIL)


def resolve_subject(user: User | BusinessUser | LogisticsUser) -> tuple[str, int, str | None, str]:
    role = str(getattr(user, "role", "") or "").strip().lower()
    if isinstance(user, BusinessUser) or role == "seller" or getattr(user, "business_name", None):
        return (
            "business",
            int(getattr(user, "id")),
            getattr(user, "email", None),
            getattr(user, "business_name", None) or getattr(user, "owner_name", None) or "Seller account",
        )
    if isinstance(user, LogisticsUser) or role == "logistics":
        return (
            "logistics",
            int(getattr(user, "id")),
            getattr(user, "email", None),
            getattr(user, "name", None) or "Delivery account",
        )
    if role == "super_admin" and int(getattr(user, "id", 0) or 0) == 0:
        return ("superadmin", 0, getattr(user, "email", None), getattr(user, "name", None) or "Super Admin")
    return ("user", int(getattr(user, "id")), getattr(user, "email", None), getattr(user, "name", None) or "User")


def serialize_notification(item: Notification) -> dict[str, Any]:
    metadata: dict[str, Any] | None = None
    if item.metadata_json:
        try:
            metadata = json.loads(item.metadata_json)
        except json.JSONDecodeError:
            metadata = None

    return {
        "id": item.id,
        "title": item.title,
        "message": item.message,
        "type": item.notification_type,
        "severity": item.severity,
        "action_href": item.action_href,
        "is_read": item.is_read,
        "email_status": item.email_status,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "read_at": item.read_at.isoformat() if item.read_at else None,
        "metadata": metadata,
    }


def list_notifications_for_subject(
    db: Session,
    recipient_type: str,
    recipient_id: int,
    *,
    limit: int = 50,
    unread_only: bool = False,
) -> list[Notification]:
    query = (
        db.query(Notification)
        .filter(Notification.recipient_type == recipient_type, Notification.recipient_id == recipient_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712
    return query.limit(max(1, min(limit, 100))).all()


def unread_count_for_subject(db: Session, recipient_type: str, recipient_id: int) -> int:
    return (
        db.query(Notification)
        .filter(
            Notification.recipient_type == recipient_type,
            Notification.recipient_id == recipient_id,
            Notification.is_read == False,  # noqa: E712
        )
        .count()
    )


def send_email_message(recipient: str, subject: str, body: str) -> None:
    if not smtp_enabled():
        logger.info("Email skipped because SMTP is not configured", extra={"recipient": recipient, "subject": subject})
        return

    message = EmailMessage()
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    if SMTP_USE_TLS:
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.starttls(context=context)
            if SMTP_USERNAME and SMTP_PASSWORD:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        if SMTP_USERNAME and SMTP_PASSWORD:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)


def send_email_message_safely(recipient: str, subject: str, body: str) -> None:
    try:
        send_email_message(recipient, subject, body)
    except Exception:
        logger.exception(
            "Notification email failed to send",
            extra={"recipient": recipient, "subject": subject},
        )


def create_notification(
    db: Session,
    *,
    recipient_type: str,
    recipient_id: int,
    title: str,
    message: str,
    notification_type: str = "system",
    severity: str = "info",
    action_href: str | None = None,
    metadata: dict[str, Any] | None = None,
    recipient_email: str | None = None,
    send_email: bool = False,
    email_subject: str | None = None,
    email_body: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> Notification:
    record = Notification(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        title=title,
        message=message,
        notification_type=notification_type,
        severity=severity,
        action_href=action_href,
        metadata_json=json.dumps(metadata) if metadata else None,
        email=recipient_email,
        email_subject=email_subject if send_email else None,
        email_status="queued" if send_email and recipient_email and smtp_enabled() else ("disabled" if send_email else "not_requested"),
    )
    db.add(record)

    if send_email and recipient_email and email_subject and email_body and smtp_enabled():
        if background_tasks is not None:
            background_tasks.add_task(send_email_message_safely, recipient_email, email_subject, email_body)
        else:
            send_email_message_safely(recipient_email, email_subject, email_body)

    return record


def mark_notification_as_read(db: Session, record: Notification) -> Notification:
    if not record.is_read:
        record.is_read = True
        record.read_at = datetime.now(timezone.utc)
        db.add(record)
    return record


def build_login_email(name: str, role_label: str, client_host: str | None, user_agent: str | None) -> tuple[str, str]:
    subject = f"SokoLnk login alert for your {role_label} account"
    body = (
        f"Hello {name},\n\n"
        f"Your {role_label} account just signed in to SokoLnk.\n"
        f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"IP/Host: {client_host or 'Unavailable'}\n"
        f"Device: {user_agent or 'Unknown device'}\n\n"
        "If this was not you, please reset your password immediately.\n\n"
        "SokoLnk Security"
    )
    return subject, body


def build_password_reset_email(name: str, reset_token: str) -> tuple[str, str]:
    subject = "SokoLnk password reset instructions"
    body = (
        f"Hello {name},\n\n"
        "A password reset was requested for your SokoLnk account.\n"
        "Use the token below to complete the reset process.\n\n"
        f"Reset token: {reset_token}\n\n"
        "If you did not request this, you can ignore this message.\n\n"
        "SokoLnk Support"
    )
    return subject, body

