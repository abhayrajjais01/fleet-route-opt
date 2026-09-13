from datetime import datetime, timezone
from fastapi import APIRouter, status, Response
from app.core.config import settings
from app.core.database import check_database_connection
from app.schemas.health import HealthCheckResponse, DatabaseStatus

router = APIRouter(tags=["Health & System"])


@router.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="System Health & Database Connectivity Check",
    description="Returns backend service health, environment details, and real-time database connection status.",
)
def get_health(response: Response) -> HealthCheckResponse:
    db_info = check_database_connection()
    is_healthy = db_info["status"] == "healthy"
    
    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthCheckResponse(
        status="healthy" if is_healthy else "degraded",
        app_name=settings.APP_NAME,
        environment=settings.APP_ENV,
        version="0.1.0",
        database=DatabaseStatus(**db_info),
        system_time=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/ready", summary="Readiness Probe")
def get_ready(response: Response):
    db_info = check_database_connection()
    if db_info["status"] != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready", "reason": db_info["error"]}
    return {"status": "ready"}
