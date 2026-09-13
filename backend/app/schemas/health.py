from typing import Optional
from pydantic import BaseModel


class DatabaseStatus(BaseModel):
    status: str
    dialect: str
    database_url: Optional[str] = None
    error: Optional[str] = None


class HealthCheckResponse(BaseModel):
    status: str
    app_name: str
    environment: str
    version: str
    database: DatabaseStatus
    system_time: str
