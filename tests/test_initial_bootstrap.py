from backend.scripts.bootstrap_users import bootstrap
from backend.services.identity.auth import verify_password
from backend.services.identity.identity_service import ROLE_APPROVED
from backend.shared.database import SessionLocal
from backend.shared.models import BusinessUser, Identity, IdentityRole, User


def _set_bootstrap_env(monkeypatch):
    values = {
        "SUPERADMIN_EMAIL": "superadmin@gmail.com",
        "SUPERADMIN_PASSWORD": "TestAdmin!2026",
        "INITIAL_SELLER_EMAIL": "seller@example.test",
        "INITIAL_SELLER_PASSWORD": "SellerPass!2026",
        "INITIAL_SELLER_PHONE": "+255712345678",
        "INITIAL_SELLER_BUSINESS_NAME": "Initial Seller Business",
        "INITIAL_SELLER_NAME": "Initial Seller",
        "INITIAL_CUSTOMER_EMAIL": "customer@example.test",
        "INITIAL_CUSTOMER_PASSWORD": "CustomerPass!2026",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_bootstrap_creates_three_database_accounts_and_is_idempotent(monkeypatch, client):
    _set_bootstrap_env(monkeypatch)

    bootstrap()
    bootstrap()

    db = SessionLocal()
    try:
        identities = db.query(Identity).order_by(Identity.email).all()
        assert [identity.email for identity in identities] == [
            "customer@example.test",
            "seller@example.test",
            "superadmin@gmail.com",
        ]
        assert db.query(User).count() == 2
        assert db.query(BusinessUser).count() == 1

        expected_roles = {
            "superadmin@gmail.com": "SUPER_ADMIN",
            "seller@example.test": "SELLER",
            "customer@example.test": "CUSTOMER",
        }
        for identity in identities:
            role = (
                db.query(IdentityRole)
                .filter(IdentityRole.identity_id == identity.id)
                .one()
            )
            assert role.role == expected_roles[identity.email]
            assert role.status == ROLE_APPROVED
            assert identity.status == "ACTIVE"
            assert identity.email_verified is True
            assert identity.password_hash != "CustomerPass!2026"

        seller_identity = next(i for i in identities if i.email == "seller@example.test")
        assert verify_password("SellerPass!2026", seller_identity.password_hash)
    finally:
        db.close()

    tokens = {}
    credentials = {
        "superadmin@gmail.com": "TestAdmin!2026",
        "seller@example.test": "SellerPass!2026",
        "customer@example.test": "CustomerPass!2026",
    }
    for email, password in credentials.items():
        response = client.post("/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200
        tokens[email] = response.json()["access_token"]

    admin_response = client.get(
        "/superadmin/me",
        headers={"Authorization": f"Bearer {tokens['superadmin@gmail.com']}"},
    )
    assert admin_response.status_code == 200
    for email in ("seller@example.test", "customer@example.test"):
        response = client.get(
            "/superadmin/me",
            headers={"Authorization": f"Bearer {tokens[email]}"},
        )
        assert response.status_code == 403

    seller_dashboard = client.get(
        "/seller/dashboard",
        headers={"Authorization": f"Bearer {tokens['seller@example.test']}"},
    )
    assert seller_dashboard.status_code == 200
    customer_dashboard = client.get(
        "/seller/dashboard",
        headers={"Authorization": f"Bearer {tokens['customer@example.test']}"},
    )
    assert customer_dashboard.status_code == 403
