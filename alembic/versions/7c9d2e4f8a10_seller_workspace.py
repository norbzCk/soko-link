"""seller workspace catalogue, inventory, quotations, payouts and engagement

Revision ID: 7c9d2e4f8a10
Revises: 5b1c2d3e4f60
Create Date: 2026-11-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7c9d2e4f8a10"
down_revision: Union[str, Sequence[str], None] = "5b1c2d3e4f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _add(table: str, column: str, definition: str) -> None:
    if not _column_exists(table, column):
        op.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {definition}"))


def upgrade() -> None:
    _add("products", "status", "status VARCHAR DEFAULT 'approved'")
    _add("products", "moderation_reason", "moderation_reason TEXT")
    _add("products", "submitted_at", "submitted_at TIMESTAMPTZ")
    _add("products", "approved_at", "approved_at TIMESTAMPTZ")
    _add("products", "approved_by", "approved_by INTEGER")
    _add("products", "archived_at", "archived_at TIMESTAMPTZ")
    _add("products", "unit", "unit VARCHAR DEFAULT 'piece'")
    _add("products", "variants_json", "variants_json TEXT")
    _add("products", "specifications_json", "specifications_json TEXT")
    _add("products", "low_stock_threshold", "low_stock_threshold INTEGER DEFAULT 5")
    _add("rfqs", "buyer_id", "buyer_id INTEGER")
    _add("rfqs", "category", "category VARCHAR")
    _add("rfqs", "deadline", "deadline TIMESTAMPTZ")


def downgrade() -> None:
    for table in (
        "dispute_messages",
        "promotions",
        "review_reports",
        "review_replies",
        "seller_payouts",
        "seller_payout_accounts",
        "rfq_clarifications",
        "quotation_events",
        "quotations",
        "inventory_movements",
    ):
        op.execute(sa.text(f"DROP TABLE IF EXISTS {table}"))
