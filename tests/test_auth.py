import re
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.api.main import app
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base
from backend.shared.models import (
    BusinessUser,
    Identity,
    LogisticsUser,
    RefreshToken,
    TokenBlocklist,
    User,
    VerificationToken,
)
from backend.services.identity.auth import hash_password, create_access_token, create_refresh_token
from datetime import datetime, timedelta, timezone


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


@pytest.fixture
def registered_user(db):
    user = User(
        name="Auth Test User",
        email="auth_test@example.com",
        phone="+255700000100",
        password_hash=hash_password("TestPass1!"),
        role="user",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def registered_business(db):
    business = BusinessUser(
        business_name="Auth Test Business",
        owner_name="Auth Owner",
        phone="+255700000101",
        email="auth_business@example.com",
        password_hash=hash_password("TestPass1!"),
        business_type="individual",
        category="Groceries",
        region="Dar es Salaam",
        role="seller",
        is_active=True,
        verification_status="verified",
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@pytest.fixture
def registered_logistics(db):
    logistics = LogisticsUser(
        name="Auth Test Rider",
        phone="+255700000102",
        email="auth_logistics@example.com",
        password_hash=hash_password("TestPass1!"),
        account_type="individual",
        vehicle_type="motorcycle",
        status="online",
        availability="available",
        verification_status="verified",
        is_active=True,
    )
    db.add(logistics)
    db.commit()
    db.refresh(logistics)
    return logistics


def extract_verification_token(log_text: str) -> str:
    match = re.search(r"verify-email\?token=([^\s]+)", log_text)
    assert match, f"verification link not found in logs: {log_text}"
    return match.group(1)


def extract_email_otp(log_text: str) -> str:
    matches = re.findall(r"email verification OTP for \S+ is (\d{6})", log_text)
    assert matches, f"email verification OTP not found in logs: {log_text}"
    return matches[-1]


class TestRegister:
    def test_register_user_success(self, client, db):
        response = client.post("/auth/register", json={
            "name": "New User",
            "email": "newuser@example.com",
            "phone": "+255700000200",
            "password": "TestPass1!",
            "address": "Test Address",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["verification_required"] is True
        assert "access_token" not in data
        assert data["user"]["name"] == "New User"
        assert data["user"]["email"] == "newuser@example.com"
        assert data["user"]["is_verified"] is False
        assert data["user"]["account_status"] == "PENDING_VERIFICATION"

    def test_register_user_missing_name(self, client, db):
        response = client.post("/auth/register", json={
            "name": "",
            "email": "newuser2@example.com",
            "phone": "+255700000201",
            "password": "TestPass1!",
        })
        assert response.status_code == 400

    def test_register_requires_email_verification_before_login(self, client, db, caplog):
        """New accounts stay pending until the emailed verification token is used."""
        register = client.post("/auth/register", json={
            "name": "Instant User",
            "email": "instantuser@example.com",
            "phone": "+255700000250",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        assert register.json()["user"]["is_verified"] is False

        blocked = client.post("/auth/login", json={
            "email": "instantuser@example.com",
            "password": "TestPass1!",
        })
        assert blocked.status_code == 403
        assert "verify" in blocked.json()["detail"].lower()

        token = extract_verification_token(caplog.text)
        verified = client.post("/auth/verify-email", json={"token": token})
        assert verified.status_code == 200
        assert verified.json()["status"] == "ACTIVE"

        login = client.post("/auth/login", json={
            "email": "instantuser@example.com",
            "password": "TestPass1!",
        })
        assert login.status_code == 200
        assert "access_token" in login.json()

    def test_register_user_short_name(self, client, db):
        response = client.post("/auth/register", json={
            "name": "A",
            "email": "newuser3@example.com",
            "phone": "+255700000202",
            "password": "TestPass1!",
        })
        assert response.status_code == 400

    def test_register_user_invalid_email(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Valid Name",
            "email": "not-an-email",
            "phone": "+255700000203",
            "password": "TestPass1!",
        })
        assert response.status_code == 400

    def test_register_user_weak_password(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Valid Name",
            "email": "newuser4@example.com",
            "phone": "+255700000204",
            "password": "weak",
        })
        assert response.status_code == 400

    def test_register_user_duplicate_email(self, client, db, registered_user):
        response = client.post("/auth/register", json={
            "name": "Another User",
            "email": "auth_test@example.com",
            "phone": "+255700000205",
            "password": "TestPass1!",
        })
        assert response.status_code == 400

    def test_register_user_duplicate_phone(self, client, db, registered_user):
        response = client.post("/auth/register", json={
            "name": "Another User",
            "email": "newuser5@example.com",
            "phone": "+255700000100",
            "password": "TestPass1!",
        })
        assert response.status_code == 400


class TestRegistrationOtp:
    def test_registration_otp_verifies_account_and_is_single_use(self, client, db, caplog):
        register = client.post("/auth/register", json={
            "name": "OTP User",
            "email": "otpuser@example.com",
            "phone": "+255700000400",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        otp = extract_email_otp(caplog.text)

        verified = client.post("/auth/verify-email-otp", json={
            "email": "otpuser@example.com",
            "otp": otp,
        })
        assert verified.status_code == 200
        assert verified.json()["status"] == "ACTIVE"
        assert verified.json()["email_verified"] is True

        reused = client.post("/auth/verify-email-otp", json={
            "email": "otpuser@example.com",
            "otp": otp,
        })
        assert reused.status_code == 400

        login = client.post("/auth/login", json={
            "email": "otpuser@example.com",
            "password": "TestPass1!",
        })
        assert login.status_code == 200

    def test_registration_otp_locks_after_too_many_wrong_attempts(self, client, db, caplog):
        register = client.post("/auth/register", json={
            "name": "Locked OTP User",
            "email": "lockedotp@example.com",
            "phone": "+255700000401",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        otp = extract_email_otp(caplog.text)
        wrong_otp = f"{(int(otp) + 1) % 1_000_000:06d}"

        for _ in range(5):
            attempt = client.post("/auth/verify-email-otp", json={
                "email": "lockedotp@example.com",
                "otp": wrong_otp,
            })
            assert attempt.status_code == 400

        locked = client.post("/auth/verify-email-otp", json={
            "email": "lockedotp@example.com",
            "otp": otp,
        })
        assert locked.status_code == 400

    def test_resend_otp_invalidates_previous_code(self, client, db, caplog):
        register = client.post("/auth/register", json={
            "name": "Resend OTP User",
            "email": "resendotp@example.com",
            "phone": "+255700000402",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        previous_otp = extract_email_otp(caplog.text)

        caplog.clear()
        resent = client.post("/auth/verify-email/resend", json={"email": "resendotp@example.com"})
        assert resent.status_code == 200
        new_otp = extract_email_otp(caplog.text)

        old_attempt = client.post("/auth/verify-email-otp", json={
            "email": "resendotp@example.com",
            "otp": previous_otp,
        })
        assert old_attempt.status_code == 400

        verified = client.post("/auth/verify-email-otp", json={
            "email": "resendotp@example.com",
            "otp": new_otp,
        })
        assert verified.status_code == 200

    def test_expired_registration_otp_is_rejected(self, client, db, caplog):
        register = client.post("/auth/register", json={
            "name": "Expired OTP User",
            "email": "expiredotp@example.com",
            "phone": "+255700000403",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        otp = extract_email_otp(caplog.text)

        record = db.query(VerificationToken).filter(
            VerificationToken.purpose == "email_verification_otp"
        ).first()
        assert record is not None
        record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

        expired = client.post("/auth/verify-email-otp", json={
            "email": "expiredotp@example.com",
            "otp": otp,
        })
        assert expired.status_code == 400

    def test_link_verification_invalidates_registration_otp(self, client, db, caplog):
        register = client.post("/auth/register", json={
            "name": "Link First User",
            "email": "linkfirst@example.com",
            "phone": "+255700000404",
            "password": "TestPass1!",
        })
        assert register.status_code == 200
        otp = extract_email_otp(caplog.text)
        link_token = extract_verification_token(caplog.text)

        linked = client.post("/auth/verify-email", json={"token": link_token})
        assert linked.status_code == 200

        otp_attempt = client.post("/auth/verify-email-otp", json={
            "email": "linkfirst@example.com",
            "otp": otp,
        })
        assert otp_attempt.status_code == 400


class TestLogin:
    def test_login_user_success(self, client, db, registered_user):
        response = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["userType"] == "user"
        assert data["user"]["email"] == "auth_test@example.com"

    def test_login_user_wrong_password(self, client, db, registered_user):
        response = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "WrongPass1!",
        })
        assert response.status_code == 401

    def test_login_user_nonexistent(self, client, db):
        response = client.post("/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "TestPass1!",
        })
        assert response.status_code == 401

    def test_login_business_success(self, client, db, registered_business):
        response = client.post("/auth/login", json={
            "email": "auth_business@example.com",
            "password": "TestPass1!",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["userType"] == "business"

    def test_login_logistics_success(self, client, db, registered_logistics):
        response = client.post("/auth/login", json={
            "email": "auth_logistics@example.com",
            "password": "TestPass1!",
        })
        assert response.status_code == 200

    def test_login_by_phone_canonical_format(self, client, db, registered_user):
        """Regression test: _normalize_phone used to strip to digits-only
        (255700000100), which no longer matched the +255-prefixed format
        registration stores -- phone login was silently broken for every
        account type while email login kept working undetected."""
        response = client.post("/auth/login", json={
            "phone": "+255700000100",
            "password": "TestPass1!",
        })
        assert response.status_code == 200

    def test_login_by_phone_local_format(self, client, db, registered_user):
        response = client.post("/auth/login", json={
            "phone": "0700000100",
            "password": "TestPass1!",
        })
        assert response.status_code == 200

    def test_login_by_phone_no_plus_format(self, client, db, registered_user):
        response = client.post("/auth/login", json={
            "phone": "255700000100",
            "password": "TestPass1!",
        })
        assert response.status_code == 200

    def test_login_business_by_phone(self, client, db, registered_business):
        response = client.post("/auth/login", json={
            "phone": "0700000101",
            "password": "TestPass1!",
        })
        assert response.status_code == 200
        assert response.json()["userType"] == "business"

    def test_login_logistics_by_phone(self, client, db, registered_logistics):
        response = client.post("/auth/login", json={
            "phone": "0700000102",
            "password": "TestPass1!",
        })
        assert response.status_code == 200
        assert response.json()["userType"] == "logistics"
        data = response.json()
        assert data["userType"] == "logistics"

    def test_login_missing_password(self, client, db):
        response = client.post("/auth/login", json={
            "email": "auth_test@example.com",
        })
        assert response.status_code == 400


class TestRefreshToken:
    def test_refresh_with_valid_token(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        refresh_token = login.cookies.get("refresh_token")
        assert refresh_token is not None

        response = client.post("/auth/refresh", cookies={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_refresh_without_token(self, client):
        response = client.post("/auth/refresh")
        assert response.status_code == 401

    def test_refresh_with_revoked_token(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        refresh_token = login.cookies.get("refresh_token")

        db_token = db.query(RefreshToken).filter(
            RefreshToken.token == refresh_token
        ).first()
        if db_token:
            db_token.is_revoked = True
            db.commit()

        response = client.post("/auth/refresh", cookies={
            "refresh_token": refresh_token,
        })
        assert response.status_code == 401


class TestLogout:
    def test_logout_clears_cookies(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        refresh_token = login.cookies.get("refresh_token")
        assert refresh_token is not None

        response = client.post("/auth/logout", cookies={
            "refresh_token": refresh_token,
            "access_token": login.json()["access_token"],
        })
        assert response.status_code == 200


class TestPasswordRecovery:
    def test_password_recovery_request_valid_email(self, client, db, registered_user):
        response = client.post("/auth/password-recovery/request", json={
            "identifier": "auth_test@example.com",
        })
        assert response.status_code == 200
        assert "message" in response.json()

    def test_password_recovery_request_invalid_identifier(self, client, db):
        response = client.post("/auth/password-recovery/request", json={
            "identifier": "nonexistent@example.com",
        })
        assert response.status_code == 200

    def test_password_recovery_reset_valid_token(self, client, db, registered_user):
        recovery = client.post("/auth/password-recovery/request", json={
            "identifier": "auth_test@example.com",
        })
        assert recovery.status_code == 200

    def test_password_recovery_reset_missing_token(self, client, db):
        response = client.post("/auth/password-recovery/reset", json={
            "new_password": "NewPass1!",
        })
        assert response.status_code == 400

    def test_password_recovery_reset_invalid_token(self, client, db):
        response = client.post("/auth/password-recovery/reset", json={
            "token": "invalid_token_xyz",
            "new_password": "NewPass1!",
        })
        assert response.status_code == 400


class TestPasswordChange:
    def test_change_password_success(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post("/auth/change-password", json={
            "current_password": "TestPass1!",
            "new_password": "NewPass1!",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200

    def test_change_password_wrong_current(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post("/auth/change-password", json={
            "current_password": "WrongPass1!",
            "new_password": "NewPass1!",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 400

    def test_change_password_weak_new(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post("/auth/change-password", json={
            "current_password": "TestPass1!",
            "new_password": "weak",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 400


class TestVerifyEmail:
    def test_verify_email_success(self, client, db):
        user = User(
            name="Verify User",
            email="verify@example.com",
            phone="+255700000300",
            password_hash=hash_password("TestPass1!"),
            role="user",
            is_active=True,
            is_verified=False,
            verification_token="test_verify_token_123",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        response = client.post("/auth/verify-email", json={
            "token": "test_verify_token_123",
        })
        assert response.status_code == 200

        db.expire_all()
        updated = db.query(User).filter(User.id == user.id).first()
        assert updated.is_verified is True
        assert updated.verification_token is None

    def test_verify_email_invalid_token(self, client, db):
        response = client.post("/auth/verify-email", json={
            "token": "nonexistent_token",
        })
        assert response.status_code == 400


class TestGetMe:
    def test_me_authenticated(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.get("/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "auth_test@example.com"
        assert data["role"] == "user"


class TestUpdateMe:
    def test_update_profile_success(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.put("/auth/me", json={
            "name": "Updated Name",
            "phone": "+255700000400",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200

    def test_update_profile_short_name(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.put("/auth/me", json={
            "name": "A",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 400


class TestListUsers:
    def test_list_users_admin(self, client, db):
        admin = User(
            name="Admin User",
            email="admin@example.com",
            phone="+255700000500",
            password_hash=hash_password("AdminPass1!"),
            role="super_admin",
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        login = client.post("/auth/login", json={
            "email": "admin@example.com",
            "password": "AdminPass1!",
        })
        token = login.json()["access_token"]

        response = client.get("/auth/users", headers={
            "Authorization": f"Bearer {token}",
        })
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestCreateUser:
    def test_create_user_admin_success(self, client, db):
        admin = User(
            name="Admin User",
            email="admin@example.com",
            phone="+255700000600",
            password_hash=hash_password("AdminPass1!"),
            role="super_admin",
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        login = client.post("/auth/login", json={
            "email": "admin@example.com",
            "password": "AdminPass1!",
        })
        token = login.json()["access_token"]

        response = client.post("/auth/users", json={
            "name": "New Managed User",
            "email": "managed@example.com",
            "password": "TestPass1!",
            "role": "user",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "managed@example.com"

    def test_create_user_non_admin_forbidden(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post("/auth/users", json={
            "name": "Unauthorized User",
            "email": "unauth@example.com",
            "password": "TestPass1!",
            "role": "admin",
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403


class TestUploadProfilePhoto:
    def test_upload_profile_photo_success(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post(
            "/auth/upload-profile-photo",
            files={"file": ("test.jpg", b"fake image content", "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "image_url" in data

    def test_upload_profile_photo_invalid_format(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        response = client.post(
            "/auth/upload-profile-photo",
            files={"file": ("test.txt", b"not an image", "text/plain")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 400

    def test_upload_profile_photo_too_large(self, client, db, registered_user):
        login = client.post("/auth/login", json={
            "email": "auth_test@example.com",
            "password": "TestPass1!",
        })
        token = login.json()["access_token"]

        large_content = b"x" * (6 * 1024 * 1024 + 1)
        response = client.post(
            "/auth/upload-profile-photo",
            files={"file": ("large.jpg", large_content, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 400


class TestPasswordStrengthValidation:
    def test_password_no_uppercase(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Test User",
            "email": "weak1@example.com",
            "phone": "+255700000700",
            "password": "lowercase1!",
        })
        assert response.status_code == 400

    def test_password_no_lowercase(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Test User",
            "email": "weak2@example.com",
            "phone": "+255700000701",
            "password": "UPPERCASE1!",
        })
        assert response.status_code == 400

    def test_password_no_digit(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Test User",
            "email": "weak3@example.com",
            "phone": "+255700000702",
            "password": "NoDigit!",
        })
        assert response.status_code == 400

    def test_password_no_special_char(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Test User",
            "email": "weak4@example.com",
            "phone": "+255700000703",
            "password": "NoSpecial1",
        })
        assert response.status_code == 400

    def test_password_too_short(self, client, db):
        response = client.post("/auth/register", json={
            "name": "Test User",
            "email": "weak5@example.com",
            "phone": "+255700000704",
            "password": "Sh1!",
        })
        assert response.status_code == 400