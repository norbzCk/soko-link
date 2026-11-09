from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services.identity.auth import create_access_token
from backend.shared.database import SessionLocal
from backend.shared.models import (
    PaymentTransaction,
    Product,
    Quotation,
    Sale,
    SellerPayoutAccount,
)
from tests.utils.test_helpers import BusinessUserFactory, LogisticsUserFactory, ProductFactory, SaleFactory, UserFactory


def seller_headers(seller):
    token = create_access_token(
        {
            "sub": seller.id,
            "user_id": seller.id,
            "user_type": "business",
            "role": "seller",
            "active_role": "SELLER",
        }
    )
    return {"Authorization": f"Bearer {token}"}


def admin_headers(client):
    response = client.post(
        "/auth/login",
        json={"email": "superadmin@gmail.com", "password": "adminkey"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def make_seller(db, name="Alpha Shop", phone="+255711000001", email="alpha@example.com"):
    return BusinessUserFactory.create(
        db,
        business_name=name,
        phone=phone,
        email=email,
    )


def paid_sale(db, seller, buyer, *, quantity=3, price=5000, status="Confirmed", suffix=""):
    sale = SaleFactory.create(
        db,
        product=f"Rice{suffix}",
        category="Groceries",
        seller_id=seller.id,
        provider_name=seller.business_name,
        created_by=buyer.id,
        quantity=quantity,
        unit_price=price,
        status=status,
    )
    db.add(
        PaymentTransaction(
            transaction_id=f"TXN-TEST-{sale.id}-{suffix or 'A'}",
            order_id=sale.id,
            payer_type="user",
            payer_id=buyer.id,
            amount=quantity * price,
            payment_method="card",
            status="completed",
            confirmed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return sale


def test_product_moderation_and_cross_seller_isolation(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    headers_a = seller_headers(seller_a)
    headers_b = seller_headers(seller_b)

    created = client.post(
        "/seller/products",
        json={
            "name": "Premium Rice",
            "category": "Groceries",
            "price": 7000,
            "stock": 20,
            "description": "25kg bag",
            "unit": "bag",
            "submit": True,
        },
        headers=headers_a,
    )
    assert created.status_code == 201, created.text
    product = created.json()["product"]
    assert product["status"] == "pending"
    assert product["is_active"] is False

    assert client.get(f"/seller/products/{product['id']}", headers=headers_b).status_code == 404
    assert client.put(f"/seller/products/{product['id']}", json={"price": 1}, headers=headers_b).status_code == 404
    assert client.post(f"/seller/products/{product['id']}/archive", headers=headers_b).status_code == 404

    admin = admin_headers(client)
    assert client.patch(
        f"/superadmin/products/{product['id']}/moderation",
        json={"decision": "approve"},
        headers=admin,
    ).status_code == 200
    approved = client.get(f"/seller/products/{product['id']}", headers=headers_a).json()["product"]
    assert approved["status"] == "approved"
    assert approved["is_active"] is True

    # Sellers cannot moderate their own catalogue.
    assert client.patch(
        f"/superadmin/products/{product['id']}/moderation",
        json={"decision": "approve"},
        headers=headers_a,
    ).status_code == 403

    resubmitted = client.put(
        f"/seller/products/{product['id']}",
        json={"price": 7500},
        headers=headers_a,
    )
    assert resubmitted.status_code == 200
    assert resubmitted.json()["product"]["status"] == "pending"
    assert resubmitted.json()["product"]["is_active"] is False

    rejected = client.patch(
        f"/superadmin/products/{product['id']}/moderation",
        json={"decision": "reject", "reason": "Price evidence missing"},
        headers=admin,
    )
    assert rejected.status_code == 200
    detail = client.get(f"/seller/products/{product['id']}", headers=headers_a).json()["product"]
    assert detail["status"] == "rejected"
    assert detail["moderation_reason"] == "Price evidence missing"


def test_inventory_ledger_validation_and_isolation(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    product = ProductFactory.create(db, seller_id=seller_a.id, stock=10, price=5000)

    received = client.post(
        "/seller/inventory/adjust",
        json={"product_id": product.id, "movement_type": "receipt", "quantity": 5, "reason": "Restock"},
        headers=seller_headers(seller_a),
    )
    assert received.status_code == 200, received.text
    assert received.json()["product"]["stock"] == 15

    damaged = client.post(
        "/seller/inventory/adjust",
        json={"product_id": product.id, "movement_type": "damage", "quantity": 3, "reason": "Broken bags"},
        headers=seller_headers(seller_a),
    )
    assert damaged.status_code == 200
    assert damaged.json()["product"]["stock"] == 12

    too_much = client.post(
        "/seller/inventory/adjust",
        json={"product_id": product.id, "movement_type": "loss", "quantity": 99, "reason": "Missing"},
        headers=seller_headers(seller_a),
    )
    assert too_much.status_code == 400

    forbidden = client.post(
        "/seller/inventory/adjust",
        json={"product_id": product.id, "movement_type": "receipt", "quantity": 5, "reason": "Hijack"},
        headers=seller_headers(seller_b),
    )
    assert forbidden.status_code == 404

    movements = client.get(
        "/seller/inventory/movements",
        params={"product_id": product.id},
        headers=seller_headers(seller_a),
    )
    assert movements.status_code == 200
    items = movements.json()["items"]
    assert len(items) == 2
    assert items[0]["movement_type"] == "damage"
    assert items[0]["quantity_delta"] == -3
    assert client.get(
        f"/seller/products/{product.id}", headers=seller_headers(seller_b)
    ).status_code == 404


def test_order_and_delivery_resource_isolation(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    buyer = UserFactory.create(db, email="buyer@example.com", phone="+255722000001")
    sale_a = paid_sale(db, seller_a, buyer, suffix="A")
    sale_b = paid_sale(db, seller_b, buyer, suffix="B")

    listed = client.get("/seller/orders", headers=seller_headers(seller_a))
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()["items"]] == [sale_a.id]
    assert client.get(f"/seller/orders/{sale_b.id}", headers=seller_headers(seller_a)).status_code == 404
    assert client.patch(
        f"/seller/orders/{sale_b.id}/decision",
        json={"decision": "accept"},
        headers=seller_headers(seller_a),
    ).status_code == 404

    accepted = client.patch(
        f"/seller/orders/{sale_a.id}/decision",
        json={"decision": "accept"},
        headers=seller_headers(seller_a),
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["order"]["status"] == "Confirmed"

    logistics = LogisticsUserFactory.create(db, phone="+255733000001", email="rider@example.com")
    assigned = client.post(
        f"/seller/orders/{sale_a.id}/assign-delivery",
        json={"logistics_id": logistics.id, "seller_id": seller_b.id},
        headers=seller_headers(seller_a),
    )
    assert assigned.status_code == 200, assigned.text
    delivery_id = assigned.json()["delivery"]["id"]

    assert client.get(f"/seller/deliveries/{delivery_id}", headers=seller_headers(seller_b)).status_code == 404
    assert client.get(f"/seller/deliveries/{delivery_id}", headers=seller_headers(seller_a)).status_code == 200


def test_quotation_privacy_and_ownership(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    rfq = client.post(
        "/rfq/",
        json={
            "company_name": "Hotel Group",
            "contact_name": "Buyer",
            "email": "buyer@hotel.com",
            "phone": "+255722000002",
            "product_interest": "Rice",
            "quantity": 50,
        },
    )
    assert rfq.status_code == 201, rfq.text
    rfq_id = rfq.json()["id"]

    submitted = client.post(
        f"/seller/rfqs/{rfq_id}/quotations",
        json={"unit_price": 4500, "lead_time_days": 3, "notes": "Bulk price"},
        headers=seller_headers(seller_a),
    )
    assert submitted.status_code == 201, submitted.text
    quotation_id = submitted.json()["quotation"]["id"]

    seen_by_b = client.get(f"/seller/rfqs/{rfq_id}", headers=seller_headers(seller_b))
    assert seen_by_b.status_code == 200
    assert seen_by_b.json()["rfq"]["my_quotation"] is None
    assert seen_by_b.json()["rfq"]["quotation_count"] == 1

    assert client.post(
        f"/seller/quotations/{quotation_id}/withdraw",
        headers=seller_headers(seller_b),
    ).status_code == 404
    withdrawn = client.post(
        f"/seller/quotations/{quotation_id}/withdraw",
        headers=seller_headers(seller_a),
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["quotation"]["status"] == "withdrawn"
    assert db.query(Quotation).filter(Quotation.id == quotation_id).first().status == "withdrawn"


def test_finance_and_payout_isolation(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    buyer = UserFactory.create(db, email="buyer2@example.com", phone="+255722000003")
    paid_sale(db, seller_a, buyer, quantity=3, price=5000, suffix="A")
    paid_sale(db, seller_b, buyer, quantity=10, price=5000, suffix="B")

    finance_a = client.get("/seller/finance/overview", headers=seller_headers(seller_a))
    assert finance_a.status_code == 200
    assert finance_a.json()["gross_revenue"] == 15000
    assert finance_a.json()["platform_fee"] == 750
    assert finance_a.json()["net_revenue"] == 14250
    assert finance_a.json()["available_for_payout"] == 14250

    finance_b = client.get("/seller/finance/overview", headers=seller_headers(seller_b))
    assert finance_b.json()["gross_revenue"] == 50000
    assert finance_b.json()["available_for_payout"] == 47500

    account = client.put(
        "/seller/payout-account",
        json={
            "method": "bank_transfer",
            "account_name": "Alpha Shop",
            "account_number": "0123456789",
            "bank_name": "Test Bank",
        },
        headers=seller_headers(seller_a),
    )
    assert account.status_code == 200, account.text
    assert account.json()["account"]["account_number_masked"].endswith("6789")
    account_id = account.json()["account"]["id"]

    assert client.post(
        "/seller/payouts",
        json={"amount": 10000},
        headers=seller_headers(seller_a),
    ).status_code == 400

    admin = admin_headers(client)
    assert client.patch(
        f"/superadmin/payout-accounts/{account_id}",
        json={"decision": "approve"},
        headers=admin,
    ).status_code == 200

    requested = client.post(
        "/seller/payouts",
        json={"amount": 10000, "idempotency_key": "payout-1"},
        headers=seller_headers(seller_a),
    )
    assert requested.status_code == 201, requested.text
    payout_id = requested.json()["payout"]["id"]
    duplicate = client.post(
        "/seller/payouts",
        json={"amount": 10000, "idempotency_key": "payout-1"},
        headers=seller_headers(seller_a),
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["payout"]["id"] == payout_id
    assert client.get("/seller/finance/overview", headers=seller_headers(seller_a)).json()["available_for_payout"] == 4250

    assert client.get("/seller/payouts", headers=seller_headers(seller_b)).json()["items"] == []
    assert client.patch(
        f"/superadmin/payouts/{payout_id}",
        json={"status": "approved"},
        headers=seller_headers(seller_a),
    ).status_code == 403
    assert client.patch(
        f"/superadmin/payouts/{payout_id}",
        json={"status": "approved"},
        headers=admin,
    ).status_code == 200
    assert client.patch(
        f"/superadmin/payouts/{payout_id}",
        json={"status": "completed"},
        headers=admin,
    ).status_code == 200
    assert client.get("/seller/payouts", headers=seller_headers(seller_a)).json()["items"][0]["status"] == "completed"


def test_reviews_disputes_and_settings_are_scoped(client, db):
    seller_a = make_seller(db)
    seller_b = make_seller(db, "Beta Shop", "+255711000002", "beta@example.com")
    buyer = UserFactory.create(db, email="buyer3@example.com", phone="+255722000004")
    sale = paid_sale(db, seller_a, buyer, status="Received", suffix="R")
    sale.rating = 2
    sale.rated_at = datetime.now(timezone.utc)
    db.add(sale)
    db.commit()

    reviews = client.get("/seller/reviews", headers=seller_headers(seller_a))
    assert reviews.status_code == 200
    assert reviews.json()["summary"]["total_reviews"] == 1
    assert reviews.json()["summary"]["distribution"]["2"] == 1
    assert client.post(
        f"/seller/reviews/{sale.id}/reply",
        json={"message": "We are sorry"},
        headers=seller_headers(seller_b),
    ).status_code == 404
    replied = client.post(
        f"/seller/reviews/{sale.id}/reply",
        json={"message": "We are sorry and have fixed the packaging."},
        headers=seller_headers(seller_a),
    )
    assert replied.status_code == 200
    reported = client.post(
        f"/seller/reviews/{sale.id}/report",
        json={"reason": "This review contains abusive language."},
        headers=seller_headers(seller_a),
    )
    assert reported.status_code == 200
    assert client.post(
        f"/seller/reviews/{sale.id}/report",
        json={"reason": "Duplicate report attempt."},
        headers=seller_headers(seller_a),
    ).status_code == 400

    dispute = client.post(
        "/seller/disputes",
        json={"sale_id": sale.id, "reason": "Customer reported a damaged bag after delivery."},
        headers=seller_headers(seller_a),
    )
    assert dispute.status_code == 201, dispute.text
    dispute_id = dispute.json()["dispute_id"]
    assert client.get(f"/seller/disputes/{dispute_id}", headers=seller_headers(seller_b)).status_code == 404
    assert client.post(
        f"/seller/disputes/{dispute_id}/messages",
        json={"message": "Please share photos of the damaged bag."},
        headers=seller_headers(seller_a),
    ).status_code == 201

    assert client.put(
        "/seller/profile",
        json={"business_name": "Hijacked Shop"},
        headers=seller_headers(seller_a),
    ).status_code == 400

    analytics = client.get("/seller/analytics", params={"range_days": 30}, headers=seller_headers(seller_a))
    assert analytics.status_code == 200
    assert analytics.json()["summary"]["orders"] == 1
    assert analytics.json()["summary"]["revenue"] == 15000
    exported = client.get(
        "/seller/analytics/export",
        params={"type": "sales", "range_days": 30},
        headers=seller_headers(seller_a),
    )
    assert exported.status_code == 200
    assert exported.text.startswith("sale_id,date,product")
    assert "RiceR" in exported.text


def test_customer_role_cannot_access_seller_workspace(client, db):
    buyer = UserFactory.create(db, email="plain@example.com", phone="+255722000099")
    token = create_access_token(
        {"sub": buyer.id, "user_id": buyer.id, "user_type": "user", "role": "user"}
    )
    response = client.get("/seller/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
