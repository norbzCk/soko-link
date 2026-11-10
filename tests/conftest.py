import os

# Must run before backend.api.main is imported: SMTP settings are captured at
# module import time. Keep tests hermetic even when the project .env enables SMTP.
os.environ["SMTP_HOST"] = ""
os.environ["SMTP_FROM_EMAIL"] = ""
os.environ["SMTP_USERNAME"] = ""
os.environ["SMTP_PASSWORD"] = ""
os.environ["APP_SECRET_KEY"] = "test-suite-only-signing-secret-2026"
# Tests authenticate against a database-backed administrator in the isolated test DB.
os.environ["SUPERADMIN_EMAIL"] = "superadmin@gmail.com"
os.environ["SUPERADMIN_PASSWORD"] = "TestAdmin!2026"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.api.main import app
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base, IdentityRole, User
from backend.api.schema import ensure_schema_columns
from backend.services.identity.auth import limiter
from backend.services.identity.identity_service import ROLE_APPROVED, ROLE_SUPER_ADMIN, STATUS_ACTIVE
from backend.services.identity.auth import create_identity


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns()
    db = SessionLocal()
    identity = create_identity(
        db,
        name="Test Administrator",
        email="superadmin@gmail.com",
        phone=None,
        password="TestAdmin!2026",
        status=STATUS_ACTIVE,
        email_verified=True,
    )
    profile = User(
        identity_id=identity.id,
        name=identity.name,
        email=identity.email,
        password_hash=identity.password_hash,
        role="super_admin",
        account_status=STATUS_ACTIVE,
        is_active=True,
        is_verified=True,
    )
    db.add(profile)
    db.add(IdentityRole(identity_id=identity.id, role=ROLE_SUPER_ADMIN, status=ROLE_APPROVED))
    db.commit()
    db.close()
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
