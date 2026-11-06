.PHONY: help install build up down restart logs clean dev test check backend frontend supabase-push supabase-pull supabase-migrate supabase-schema

VENV ?= .venv
PYTHON = $(VENV)/bin/python
UVICORN = $(VENV)/bin/uvicorn
NPM ?= $(shell which npm 2>/dev/null || (which flatpak-spawn >/dev/null 2>&1 && echo "flatpak-spawn --host npm") || echo "npm")

help:
	@echo "Commands:"
	@echo "  make install          - Install backend and frontend dependencies"
	@echo "  make dev              - Run backend + frontend locally"
	@echo "  make backend          - Run the FastAPI gateway"
	@echo "  make frontend         - Run the Vite frontend"
	@echo "  make test             - Run the backend test suite"
	@echo "  make check            - Compile-check Python sources"
	@echo "  make build            - Build Docker images"
	@echo "  make up / down        - Start / stop Docker services"
	@echo "  make logs             - Follow Docker logs"
	@echo "  make clean            - Remove containers and volumes"
	@echo "  make supabase-schema  - Export SQL schema for Supabase"
	@echo "  make supabase-push    - Sync local DB -> Supabase"
	@echo "  make supabase-pull    - Sync Supabase -> local DB"
	@echo "  make supabase-migrate - Run Alembic migrations"

install:
	$(PYTHON) -m pip install -r requirements-dev.txt
	cd frontend && $(NPM) install

dev:
	@echo "Starting Soko-Link backend on :8000 and frontend on :5173..."
	@trap 'kill 0' INT TERM; \
	PYTHONPATH=. $(UVICORN) backend.api.main:app --host 0.0.0.0 --port 8000 --reload & \
	(cd frontend && $(NPM) run dev -- --host 0.0.0.0) & \
	wait

backend:
	PYTHONPATH=. $(UVICORN) backend.api.main:app --host 0.0.0.0 --port 8000 --reload

frontend:
	cd frontend && $(NPM) run dev -- --host 0.0.0.0

test:
	PYTHONPATH=. DATABASE_URL=sqlite:///./test.db $(PYTHON) -m pytest -q

check:
	$(PYTHON) -m compileall -q backend tests alembic

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

clean:
	docker compose down -v

supabase-push:
	$(PYTHON) -m backend.scripts.supabase_sync push

supabase-pull:
	$(PYTHON) -m backend.scripts.supabase_sync pull

supabase-migrate:
	$(VENV)/bin/alembic upgrade head

supabase-schema:
	$(PYTHON) -m backend.scripts.generate_sql_schema supabase_schema.sql
