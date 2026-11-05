from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class DisputeBase(BaseModel):
    sale_id: int
    buyer_id: int
    seller_id: int
    logistics_id: Optional[int] = None
    status: str
    resolution_details: Optional[str] = None

class DisputeCreate(DisputeBase):
    pass

class DisputeUpdate(BaseModel):
    status: Optional[str] = None
    resolution_details: Optional[str] = None

class DisputeInDBBase(DisputeBase):
    id: int
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class Dispute(DisputeInDBBase):
    pass

class DisputeInDB(DisputeInDBBase):
    pass