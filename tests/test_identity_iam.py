import re

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base, Identity, User
from backend.services.identity.auth import limiter


@pytest.fixture(autouse=True)
def setup_test_db():
    limiter.enabled = False
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    limiter.enabled = True


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    db = SessionLocal()
    yield db
    db.close()


def last_verification_token(caplog) -> str:
    matches = re.findall(r"verify-email\?token=([^\s]+)", caplog.text)
    assert matches, "verification link not found"
    return matches[-1]


def register_and_verify(client, caplog, email="iam@example.com", phone="+255700000800"):
    response = client.post("/auth/register", json={
        "name": "IAM Test",
        "email": email,
        "phone": phone,
        "password": "TestPass1!",
    })
    assert response.status_code == 200
    verified = client.post("/auth/verify-email", json={"token": last_verification_token(caplog)})
    assert verified.status_code == 200
    login = client.post("/auth/login", json={"email": email, "password": "TestPass1!"})
    assert login.status_code == 200
    return login.json()


def superadmin_headers(client):
    response = client.post("/auth/login", json={
        "email": "superadmin@gmail.com",
        "password": "TestAdmin!2026",
    })
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_customer_applies_for_seller_and_switches_after_approval(client, db, caplog):
    session = register_and_verify(client, caplog)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    application = client.post("/auth/applications", json={
        "role": "SELLER",
        "business_name": "IAM Shop",
    }, headers=headers)
    assert application.status_code == 200
    assert application.json()["status"] == "PENDING"

    admin_headers = superadmin_headers(client)
    approval = client.post(
        f"/auth/admin/applications/{application.json()['id']}/approve",
        headers=admin_headers,
    )
    assert approval.status_code == 200

    login = client.post("/auth/login", json={"email": "iam@example.com", "password": "TestPass1!"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert "SELLER" in login.json()["roles"]

    switched = client.post("/auth/switch-role", json={"role": "SELLER"}, headers={"Authorization": f"Bearer {token}"})
    assert switched.status_code == 200
    assert switched.json()["active_role"] == "SELLER"
    assert switched.json()["user_type"] == "business"

    seller_headers = {"Authorization": f"Bearer {switched.json()['access_token']}"}
    assert client.get("/business/me", headers=seller_headers).status_code == 200
    assert client.get("/auth/roles", headers=seller_headers).json()["active_role"] == "SELLER"


def test_suspended_identity_loses_access_and_cannot_login(client, db, caplog):
    session = register_and_verify(client, caplog, email="suspend@example.com", phone="+255700000801")
    user_headers = {"Authorization": f"Bearer {session['access_token']}"}
    assert client.get("/auth/me", headers=user_headers).status_code == 200

    admin_headers = superadmin_headers(client)
    identities = client.get("/auth/admin/identities", headers=admin_headers).json()
    identity = next(item for item in identities if item["email"] == "suspend@example.com")
    suspended = client.patch(
        f"/auth/admin/identities/{identity['id']}/status",
        json={"status": "SUSPENDED"},
        headers=admin_headers,
    )
    assert suspended.status_code == 200

    assert client.get("/auth/me", headers=user_headers).status_code in {401, 403}
    login = client.post("/auth/login", json={"email": "suspend@example.com", "password": "TestPass1!"})
    assert login.status_code == 403


def test_only_superadmin_can_assign_privileged_roles(client, db, caplog):
    admin_headers = superadmin_headers(client)
    created = client.post("/auth/users", json={
        "name": "Limited Admin",
        "email": "limited-admin@example.com",
        "password": "TestPass1!",
        "role": "admin",
    }, headers=admin_headers)
    assert created.status_code == 200

    session = register_and_verify(client, caplog, email="target@example.com", phone="+255700000802")
    identities = client.get("/auth/admin/identities", headers=admin_headers).json()
    target = next(item for item in identities if item["email"] == "target@example.com")

    admin_login = client.post("/auth/login", json={"email": "limited-admin@example.com", "password": "TestPass1!"})
    assert admin_login.status_code == 200
    limited_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    denied = client.post(
        f"/auth/admin/identities/{target['id']}/roles",
        json={"role": "ANALYST", "status": "APPROVED"},
        headers=limited_headers,
    )
    assert denied.status_code == 403

    allowed = client.post(
        f"/auth/admin/identities/{target['id']}/roles",
        json={"role": "ANALYST", "status": "APPROVED"},
        headers=admin_headers,
    )
    assert allowed.status_code == 200
    assert any(role["role"] == "ANALYST" for role in allowed.json()["identity"]["roles"])

    denied_status = client.patch(
        f"/auth/admin/identities/{target['id']}/status",
        json={"status": "SUSPENDED"},
        headers=limited_headers,
    )
    assert denied_status.status_code == 403

    target_profile = db.query(User).filter(User.email == "target@example.com").first()
    escalation = client.patch(
        f"/auth/users/{target_profile.id}",
        json={"role": "super_admin"},
        headers=limited_headers,
    )
    assert escalation.status_code == 403


def test_phone_otp_verifies_identity_phone(client, db, caplog):
    response = client.post("/auth/register", json={
        "name": "Phone Test",
        "email": "phone@example.com",
        "phone": "+255700000803",
        "password": "TestPass1!",
    })
    assert response.status_code == 200

    sent = client.post("/auth/phone/send-otp", json={"phone": "+255700000803"})
    assert sent.status_code == 200
    matches = re.findall(r"phone OTP for \S+ is (\d{6})", caplog.text)
    assert matches, "phone OTP not found in logs"

    verified = client.post("/auth/phone/verify-otp", json={
        "phone": "+255700000803",
        "otp": matches[-1],
    })
    assert verified.status_code == 200
    assert verified.json()["phone_verified"] is True

    identity = db.query(Identity).filter(Identity.email == "phone@example.com").first()
    db.refresh(identity)
    assert identity.phone_verified is True


def test_refresh_tokens_rotate_and_old_token_is_revoked(client, db, caplog):
    session = register_and_verify(client, caplog, email="refresh@example.com", phone="+255700000804")
    login = client.post("/auth/login", json={"email": "refresh@example.com", "password": "TestPass1!"})
    old_refresh = login.cookies.get("refresh_token")
    assert old_refresh

    rotated = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert rotated.status_code == 200
    new_refresh = rotated.cookies.get("refresh_token")
    assert new_refresh and new_refresh != old_refresh

    reused = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert reused.status_code == 401

    current = client.post("/auth/refresh", cookies={"refresh_token": new_refresh})
    assert current.status_code == 200


def test_password_recovery_uses_hashed_email_token(client, db, caplog):
    register_and_verify(client, caplog, email="reset@example.com", phone="+255700000805")
    requested = client.post("/auth/password-recovery/request", json={"identifier": "reset@example.com"})
    assert requested.status_code == 200
    assert "reset_token" not in requested.json()

    matches = re.findall(r"forgot-password\?token=([^\s]+)", caplog.text)
    assert matches, "password reset link not found"

    reset = client.post("/auth/password-recovery/reset", json={
        "token": matches[-1],
        "new_password": "NewPass1!",
    })
    assert reset.status_code == 200

    old_login = client.post("/auth/login", json={"email": "reset@example.com", "password": "TestPass1!"})
    assert old_login.status_code == 401
    new_login = client.post("/auth/login", json={"email": "reset@example.com", "password": "NewPass1!"})
    assert new_login.status_code == 200
