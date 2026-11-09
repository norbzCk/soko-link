import os

# Must run before backend.api.main is imported: SMTP settings are captured at
# module import time. Keep tests hermetic even when the project .env enables SMTP.
os.environ["SMTP_HOST"] = ""
os.environ["SMTP_FROM_EMAIL"] = ""
os.environ["SMTP_USERNAME"] = ""
os.environ["SMTP_PASSWORD"] = ""
# Tests authenticate against the known development superadmin bootstrap.
os.environ["SUPERADMIN_EMAIL"] = "superadmin@gmail.com"
os.environ["SUPERADMIN_PASSWORD"] = "adminkey"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.api.main import app
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base
from backend.api.schema import ensure_schema_columns
from backend.services.identity.auth import limiter


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns()
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