from sqlalchemy import text

from backend.shared.database import engine


def ensure_schema_columns():
    from sqlalchemy import text, inspect
    from backend.shared.database import engine
    
    is_sqlite = 'sqlite' in str(engine.url)
    
    with engine.connect() as conn:
        def table_exists(table_name):
            if is_sqlite:
                result = conn.execute(text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")).fetchall()
                return len(result) > 0
            else:
                result = conn.execute(text(f"""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = '{table_name}'
                """)).fetchall()
                return len(result) > 0

        def column_exists(table_name, column_name):
            if not table_exists(table_name):
                return False
            if is_sqlite:
                result = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
                return any(row[1] == column_name for row in result)
            else:
                result = conn.execute(text(f"""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = '{table_name}' AND column_name = '{column_name}'
                """)).fetchall()
                return len(result) > 0
        
        def add_column_if_not_exists(table_name, column_name, column_def):
            if not column_exists(table_name, column_name):
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_def}"))
                conn.commit()
        
        # Lightweight schema patching for existing databases (no Alembic yet).
        add_column_if_not_exists("sales", "created_by", "created_by INTEGER")

        # Supabase Auth integration columns
        add_column_if_not_exists("users", "supabase_uid", "supabase_uid VARCHAR")
        add_column_if_not_exists("business_users", "supabase_uid", "supabase_uid VARCHAR")
        add_column_if_not_exists("logistics_users", "supabase_uid", "supabase_uid VARCHAR")

        # Unified IAM links and account status columns.
        add_column_if_not_exists("users", "identity_id", "identity_id INTEGER")
        add_column_if_not_exists("users", "account_status", "account_status VARCHAR DEFAULT 'ACTIVE'")
        add_column_if_not_exists("business_users", "identity_id", "identity_id INTEGER")
        add_column_if_not_exists("business_users", "account_status", "account_status VARCHAR DEFAULT 'ACTIVE'")
        add_column_if_not_exists("logistics_users", "identity_id", "identity_id INTEGER")
        add_column_if_not_exists("logistics_users", "account_status", "account_status VARCHAR DEFAULT 'ACTIVE'")
        add_column_if_not_exists("refresh_tokens", "identity_id", "identity_id INTEGER")
        add_column_if_not_exists("refresh_tokens", "active_role", "active_role VARCHAR")
        add_column_if_not_exists("refresh_tokens", "revoked_at", "revoked_at TIMESTAMPTZ")

        # Product catalog: allow storing picture URL per item.
        add_column_if_not_exists("products", "image_url", "image_url VARCHAR")
        add_column_if_not_exists("products", "rating_avg", "rating_avg DOUBLE PRECISION DEFAULT 0")
        add_column_if_not_exists("products", "rating_count", "rating_count INTEGER DEFAULT 0")
        add_column_if_not_exists("products", "provider_id", "provider_id INTEGER")
        add_column_if_not_exists("products", "status", "status VARCHAR DEFAULT 'approved'")
        add_column_if_not_exists("products", "moderation_reason", "moderation_reason TEXT")
        add_column_if_not_exists("products", "submitted_at", "submitted_at TIMESTAMPTZ")
        add_column_if_not_exists("products", "approved_at", "approved_at TIMESTAMPTZ")
        add_column_if_not_exists("products", "approved_by", "approved_by INTEGER")
        add_column_if_not_exists("products", "archived_at", "archived_at TIMESTAMPTZ")
        add_column_if_not_exists("products", "unit", "unit VARCHAR DEFAULT 'piece'")
        add_column_if_not_exists("products", "variants_json", "variants_json TEXT")
        add_column_if_not_exists("products", "specifications_json", "specifications_json TEXT")
        add_column_if_not_exists("products", "low_stock_threshold", "low_stock_threshold INTEGER DEFAULT 5")
        add_column_if_not_exists("rfqs", "buyer_id", "buyer_id INTEGER")
        add_column_if_not_exists("rfqs", "category", "category VARCHAR")
        add_column_if_not_exists("rfqs", "deadline", "deadline TIMESTAMPTZ")

        add_column_if_not_exists("sales", "product_id", "product_id INTEGER")
        add_column_if_not_exists("sales", "status", "status VARCHAR DEFAULT 'Received'")
        add_column_if_not_exists("sales", "rating", "rating INTEGER")
        add_column_if_not_exists("sales", "rated_at", "rated_at TIMESTAMPTZ")

        add_column_if_not_exists("sales", "provider_id", "provider_id INTEGER")
        add_column_if_not_exists("sales", "provider_name", "provider_name VARCHAR")
        add_column_if_not_exists("sales", "delivery_address", "delivery_address VARCHAR")
        add_column_if_not_exists("sales", "delivery_phone", "delivery_phone VARCHAR")
        add_column_if_not_exists("sales", "delivery_notes", "delivery_notes VARCHAR")
        add_column_if_not_exists("sales", "delivery_method", "delivery_method VARCHAR DEFAULT 'Standard'")

        add_column_if_not_exists("orders", "delivery_fee", "delivery_fee DOUBLE PRECISION DEFAULT 0")
