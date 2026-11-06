from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.services.identity.auth import require_roles
from backend.services.intelligence.dashboard import (
    dashboard_analytics,
    dashboard_stats,
    get_recent_sales,
    revenue_by_product,
    revenue_over_time,
)
from backend.shared.database import get_db
from backend.shared.models import Sale, User

router = APIRouter(tags=["Analytics"])


@router.get("/dashboard/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    return dashboard_stats(db, current)

@router.get("/dashboard/revenue-product")
def get_revenue_product(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    return revenue_by_product(db, current)

@router.get("/dashboard/revenue-time")
def get_revenue_time(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    return revenue_over_time(db, current)

@router.get("/dashboard/recent-sales")
def recent_sales(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    return get_recent_sales(db, current)

@router.get("/dashboard/analytics")
def get_dashboard_analytics(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    return dashboard_analytics(db, current)

@router.get("/dashboard/market-insights")
def get_market_insights(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    from backend.services.intelligence.analysis.sales_analysis import market_insights, pricing_insights, demand_forecast, peak_sales_periods, customer_buying_patterns
    return {
        "market": market_insights(db),
        "pricing": pricing_insights(db),
        "demand": demand_forecast(db),
        "peak_periods": peak_sales_periods(db),
        "customer_patterns": customer_buying_patterns(db)
    }

@router.get("/dashboard/export-sales")
def export_sales_report(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles("admin", "super_admin", "owner", "analyst")),
):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    from backend.shared.models import Sale

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Date", "Product", "Category", "Quantity", "Unit Price", "Total", "Status"])

    sales = db.query(Sale).order_by(Sale.date.desc()).all()
    for s in sales:
        writer.writerow([
            s.id,
            s.date.isoformat() if s.date else "",
            s.product,
            s.category,
            s.quantity,
            s.unit_price,
            (s.quantity or 0) * (s.unit_price or 0),
            s.status
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales_report.csv"}
    )
