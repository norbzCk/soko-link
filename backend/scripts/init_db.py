"""Compatibility entry point for applying the project's Alembic migrations."""

from pathlib import Path

from alembic import command
from alembic.config import Config


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[2]
    command.upgrade(Config(str(project_root / "alembic.ini")), "head")
