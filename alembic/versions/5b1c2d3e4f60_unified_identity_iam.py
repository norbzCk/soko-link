"""unified identity, roles, applications and verification tokens

Revision ID: 5b1c2d3e4f60
Revises: a97801d195fa
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

from backend.shared.models import (
    Identity,
    IdentityRole,
    RoleApplication,
    VerificationToken,
)


revision = "5b1c2d3e4f60"
down_revision = "a97801d195fa"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
        return any(row[1] == column for row in rows)
    row = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).fetchone()
    return row is not None


def _add_column(table: str, column: sa.Column):
    if not _column_exists(table, column.name):
        op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    Identity.__table__.create(bind=bind, checkfirst=True)
    IdentityRole.__table__.create(bind=bind, checkfirst=True)
    RoleApplication.__table__.create(bind=bind, checkfirst=True)
    VerificationToken.__table__.create(bind=bind, checkfirst=True)

    for table in ("users", "business_users", "logistics_users"):
        _add_column(table, sa.Column("identity_id", sa.Integer(), nullable=True))
        _add_column(
            table,
            sa.Column("account_status", sa.String(), nullable=False, server_default=sa.text("'ACTIVE'")),
        )
        op.create_index(
            f"ix_{table}_identity_id", table, ["identity_id"], unique=False, if_not_exists=True
        )

    _add_column("refresh_tokens", sa.Column("identity_id", sa.Integer(), nullable=True))
    _add_column("refresh_tokens", sa.Column("active_role", sa.String(), nullable=True))
    _add_column("refresh_tokens", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for table in ("users", "business_users", "logistics_users"):
        op.drop_index(f"ix_{table}_identity_id", table_name=table, if_exists=True)
        op.drop_column(table, "account_status")
        op.drop_column(table, "identity_id")

    for column in ("revoked_at", "active_role", "identity_id"):
        if _column_exists("refresh_tokens", column):
            op.drop_column("refresh_tokens", column)

    VerificationToken.__table__.drop(bind=op.get_bind(), checkfirst=True)
    RoleApplication.__table__.drop(bind=op.get_bind(), checkfirst=True)
    IdentityRole.__table__.drop(bind=op.get_bind(), checkfirst=True)
    Identity.__table__.drop(bind=op.get_bind(), checkfirst=True)
