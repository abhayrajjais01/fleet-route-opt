from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router

api_router = APIRouter()

# System Probes & Health
api_router.include_router(health_router, prefix="")

# Track B: Role-Based Authentication & Authorization
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication & RBAC"])

# Track A Mount Points (Manthan Nimodiya):
# from app.api.v1.fleet import router as fleet_router
# from app.api.v1.shipments import router as shipments_router
# from app.api.v1.routes import router as routes_router
# from app.api.v1.tracking import router as tracking_router
