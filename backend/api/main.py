import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_BASE_DIR / ".env", override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from backend.api.routers import admin, analytics, frontend, health, marketplace
from backend.api.schema import ensure_schema_columns
from backend.api.seed import seed_marketplace_demo_data
from backend.services.catalog.products import router as products_router
from backend.services.catalog.providers import router as providers_router
from backend.services.catalog.rfq import router as rfq_router
from backend.services.delivery.logistics import router as logistics_router
from backend.services.disputes.router import router as disputes_router
from backend.services.identity.auth import limiter
from backend.services.identity.auth import router as auth_router
from backend.services.identity.customers import router as customers_router
from backend.services.intelligence.ai_assistant import router as ai_assistant_router
from backend.services.notifications.notifications import router as notifications_router
from backend.services.orders.sales import router as sales_router
from backend.services.payments.payments import router as payments_router
from backend.services.sellers.business import router as business_router
from backend.services.sellers.workspace import router as seller_workspace_router
from backend.shared.database import SessionLocal, engine
from backend.shared.models import Base, Product, Sale


def _is_remote_database() -> bool:
    return engine.url.drivername == "postgresql" and engine.url.host not in (
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    )


def _seed_demo_data() -> None:
    db: Session = SessionLocal()
    try:
        seed_marketplace_demo_data(db)
        if db.query(Sale).count() == 0:
            demo_products = db.query(Product).filter(Product.seller_id.isnot(None)).limit(5).all()
            sample_sales = [
                Sale(
                    date=date.today(),
                    product=product.name,
                    category=product.category,
                    product_id=product.id,
                    seller_id=product.seller_id,
                    quantity=2,
                    unit_price=product.price,
                    status="Received",
                    rating=5,
                )
                for product in demo_products
            ]
            db.add_all(sample_sales)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not _is_remote_database():
        Base.metadata.create_all(bind=engine)
    ensure_schema_columns()
    _seed_demo_data()
    yield


app = FastAPI(title="SokoLink API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _parse_cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if not origins:
        origins = [
            origin.replace("+origin", "")
            for origin in [os.environ.get("FRONTEND_URL", "")]
            if origin
        ]
    if not origins:
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    return origins


_cors_origins = _parse_cors_origins()
_explicit_wildcard = "*" in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if _explicit_wildcard else _cors_origins,
    allow_origin_regex=r"https?://.*" if _explicit_wildcard else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

app.include_router(products_router)
app.include_router(customers_router)
app.include_router(sales_router)
app.include_router(rfq_router)
app.include_router(providers_router)
app.include_router(payments_router)
app.include_router(business_router)
app.include_router(seller_workspace_router)
app.include_router(logistics_router)
app.include_router(notifications_router)
app.include_router(auth_router)
app.include_router(ai_assistant_router)
app.include_router(disputes_router)
app.include_router(health.router)
app.include_router(marketplace.router)
app.include_router(admin.router)
app.include_router(analytics.router)
app.include_router(frontend.router)
