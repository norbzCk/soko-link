import io
import re

import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base, BusinessUser
from backend.services.identity.auth import hash_password


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    db = SessionLocal()
    yield db
    db.close()


VALID_PAYLOAD = {
    "business_name": "Kilimo Fresh Produce",
    "owner_name": "Amina Hassan",
    "phone": "0712345678",
    "email": "amina@example.com",
    "password": "SecurePass1!",
    "region": "Dar es Salaam",
}


class TestBusinessRegister:
    def test_register_success_requires_verification_and_approval(self, client, db, caplog):
        response = client.post("/business/register", data=VALID_PAYLOAD)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" not in data
        assert data["verification_required"] is True
        assert data["approval_required"] is True
        assert data["userType"] == "business"
        assert data["user"]["role"] == "seller"

        blocked = client.post("/auth/login", json={
            "email": "amina@example.com",
            "password": "SecurePass1!",
        })
        assert blocked.status_code == 403
        assert "verify" in blocked.json()["detail"].lower()

        token = re.search(r"verify-email\?token=([^\s]+)", caplog.text).group(1)
        assert client.post("/auth/verify-email", json={"token": token}).status_code == 200

        pending = client.post("/auth/login", json={
            "email": "amina@example.com",
            "password": "SecurePass1!",
        })
        assert pending.status_code == 403
        assert "approval" in pending.json()["detail"].lower()

        admin = client.post("/auth/login", json={
            "email": "superadmin@gmail.com",
            "password": "adminkey",
        })
        admin_headers = {"Authorization": f"Bearer {admin.json()['access_token']}"}
        applications = client.get("/auth/admin/applications?status=PENDING", headers=admin_headers).json()
        seller_application = next(item for item in applications if item["identity"]["email"] == "amina@example.com")
        approved = client.post(
            f"/auth/admin/applications/{seller_application['id']}/approve",
            headers=admin_headers,
        )
        assert approved.status_code == 200

        login = client.post("/auth/login", json={
            "email": "amina@example.com",
            "password": "SecurePass1!",
        })
        assert login.status_code == 200
        seller_token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {seller_token}"}
        assert client.get("/business/me", headers=headers).status_code == 200

        from backend.shared.models import User
        stray_customer = db.query(User).filter(User.phone == "+255712345678").first()
        assert stray_customer is None

    def test_register_email_otp_verifies_before_approval(self, client, db, caplog):
        response = client.post("/business/register", data={**VALID_PAYLOAD, "email": "otp-seller@example.com"})
        assert response.status_code == 200
        matches = re.findall(r"email verification OTP for \S+ is (\d{6})", caplog.text)
        assert matches

        verified = client.post("/auth/verify-email-otp", json={
            "email": "otp-seller@example.com",
            "otp": matches[-1],
        })
        assert verified.status_code == 200

        pending = client.post("/auth/login", json={
            "email": "otp-seller@example.com",
            "password": "SecurePass1!",
        })
        assert pending.status_code == 403
        assert "approval" in pending.json()["detail"].lower()

    def test_register_with_logo_upload(self, client, db):
        fake_png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
        files = {"logo": ("logo.png", io.BytesIO(fake_png), "image/png")}
        data = {**VALID_PAYLOAD, "phone": "0712345679", "email": "logo@example.com"}
        response = client.post("/business/register", data=data, files=files)
        assert response.status_code == 200
        assert response.json()["user"]["shop_logo_url"].startswith("data:image/png;base64,")

    def test_register_rejects_non_image_logo(self, client, db):
        files = {"logo": ("not-an-image.txt", io.BytesIO(b"hello"), "text/plain")}
        data = {**VALID_PAYLOAD, "phone": "0712345680", "email": "badfile@example.com"}
        response = client.post("/business/register", data=data, files=files)
        assert response.status_code == 400

    def test_register_weak_password_rejected(self, client, db):
        data = {**VALID_PAYLOAD, "phone": "0712345681", "email": "weak@example.com", "password": "weak"}
        response = client.post("/business/register", data=data)
        assert response.status_code == 400

    def test_register_invalid_phone_rejected(self, client, db):
        data = {**VALID_PAYLOAD, "phone": "123", "email": "badphone@example.com"}
        response = client.post("/business/register", data=data)
        assert response.status_code == 400

    def test_register_duplicate_phone_rejected(self, client, db):
        client.post("/business/register", data=VALID_PAYLOAD)
        response = client.post("/business/register", data={**VALID_PAYLOAD, "email": "different@example.com"})
        assert response.status_code == 400

    def test_register_duplicate_email_rejected(self, client, db):
        client.post("/business/register", data=VALID_PAYLOAD)
        response = client.post("/business/register", data={**VALID_PAYLOAD, "phone": "0712345682"})
        assert response.status_code == 400

    def test_register_short_business_name_rejected(self, client, db):
        data = {**VALID_PAYLOAD, "phone": "0712345684", "email": "shortname@example.com", "business_name": "A"}
        response = client.post("/business/register", data=data)
        assert response.status_code == 400

    def test_register_without_email_rejected(self, client, db):
        data = {k: v for k, v in VALID_PAYLOAD.items() if k != "email"}
        data["phone"] = "0712345685"
        response = client.post("/business/register", data=data)
        assert response.status_code == 400

    def test_register_ignores_client_supplied_role(self, client, db):
        data = {**VALID_PAYLOAD, "phone": "0712345683", "email": "escalation@example.com", "role": "super_admin"}
        response = client.post("/business/register", data=data)
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "seller"
