from datetime import date
import os
import sys

# Allow running as `python backend/init_db.py` from project root.
if __package__ is None or __package__ == "":
    sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.services.identity.auth import hash_password
from backend.shared.database import engine
from backend.shared.models import Base, Provider, Sale, User

Base.metadata.create_all(bind=engine)
print("Database tables created successfully.")

session = Session(bind=engine)

# Lightweight schema patching for existing databases (no Alembic yet).
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS created_by INTEGER
        """
    )
)
session.commit()

# Product catalog: allow storing picture URL per item.
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS products
        ADD COLUMN IF NOT EXISTS image_url VARCHAR
        """
    )
)
session.commit()
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS products
        ADD COLUMN IF NOT EXISTS rating_avg DOUBLE PRECISION DEFAULT 0
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS products
        ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0
        """
    )
)
session.commit()
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS products
        ADD COLUMN IF NOT EXISTS provider_id INTEGER
        """
    )
)
session.commit()
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS product_id INTEGER
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Received'
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS rating INTEGER
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ
        """
    )
)
session.commit()
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS provider_id INTEGER
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS provider_name VARCHAR
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS delivery_address VARCHAR
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS delivery_phone VARCHAR
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS delivery_notes VARCHAR
        """
    )
)
session.execute(
    text(
        """
        ALTER TABLE IF EXISTS sales
        ADD COLUMN IF NOT EXISTS delivery_method VARCHAR DEFAULT 'Standard'
        """
    )
)
session.commit()

# Normalize legacy schemas where sales.created_by was varchar/text.
session.execute(
    text(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'sales'
                  AND column_name = 'created_by'
                  AND data_type IN ('character varying', 'text')
            ) THEN
                ALTER TABLE sales
                ALTER COLUMN created_by TYPE INTEGER
                USING (
                    CASE
                        WHEN created_by IS NULL THEN NULL
                        WHEN trim(created_by::text) = '' THEN NULL
                        WHEN trim(created_by::text) ~ '^[0-9]+$' THEN trim(created_by::text)::INTEGER
                        ELSE NULL
                    END
                );
            END IF;
        END $$;
        """
    )
)
session.commit()

if session.query(Sale).count() == 0:
    sample_sales = [
        Sale(date=date(2026, 1, 1), product="Laptop", category="Electronics", quantity=2, unit_price=1200),
        Sale(date=date(2026, 1, 1), product="Mouse", category="Electronics", quantity=5, unit_price=20),
        Sale(date=date(2026, 1, 2), product="Laptop", category="Electronics", quantity=1, unit_price=1200),
        Sale(date=date(2026, 1, 2), product="Keyboard", category="Electronics", quantity=3, unit_price=50),
    ]
    session.add_all(sample_sales)
    session.commit()
    print("Sample sales inserted.")
else:
    print("Sales already seeded, skipping.")

if session.query(Provider).count() == 0:
    sample_providers = [
        Provider(name="Kariakoo Electronics", location="Dar es Salaam", verified=True, response_time="< 6 hrs", min_order_qty="100 pcs"),
        Provider(name="Ushirika Textiles", location="Dar es Salaam", verified=True, response_time="< 8 hrs", min_order_qty="200 pcs"),
        Provider(name="Kariakoo Home Goods", location="Dar es Salaam", verified=False, response_time="< 12 hrs", min_order_qty="150 pcs"),
    ]
    session.add_all(sample_providers)
    session.commit()
    print("Sample providers inserted.")
else:
    print("Providers already seeded, skipping.")

defaults = [
    ("System Owner", "owner@sales.local", "owner", "Owner@1234"),
    ("Business Admin", "admin@sales.local", "admin", "Admin@1234"),
    ("Sales User", "user@sales.local", "user", "User@1234"),
]

for name, email, role, password in defaults:
    existing = session.query(User).filter(User.email == email).first()
    if existing:
        if email == "owner@sales.local" and existing.role != "owner":
            existing.role = "owner"
            session.add(existing)
        continue
    session.add(
        User(
            name=name,
            email=email,
            role=role,
            password_hash=hash_password(password),
            is_active=True,
        )
    )
session.commit()
print("Default users ensured.")

session.close()
