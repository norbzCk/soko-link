from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.services.intelligence.marketplace_intelligence import build_marketplace_trends
from backend.shared.database import get_db

router = APIRouter(tags=["Marketplace"])


@router.get("/marketplace/trends")
def marketplace_trends(db: Session = Depends(get_db)):
    return build_marketplace_trends(db)
