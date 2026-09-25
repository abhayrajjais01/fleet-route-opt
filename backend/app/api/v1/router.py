from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.fleet import router as fleet_router
from app.api.v1.shipments import router as shipments_router
from app.api.v1.audit import router as audit_router

api_router = APIRouter()

# Core System Health Probes
api_router.include_router(health_router, prefix="")

# =====================================================================
# TRACK A: Operations & Optimization Engine (Manthan Nimodiya)
# =====================================================================
api_router.include_router(fleet_router, prefix="/fleet", tags=["Fleet Asset Management"])
# from app.api.v1.routes import router as routes_router
# from app.api.v1.tracking import router as tracking_router
# api_router.include_router(routes_router, prefix="/routes", tags=["Route Optimization (VRPTW)"])
# api_router.include_router(tracking_router, prefix="/tracking", tags=["Live Tracking & FSM"])

# =====================================================================
# TRACK B: Multi-Agent AI & Governance (Abhayraj Jaiswal)
# =====================================================================
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication & RBAC"])
api_router.include_router(shipments_router, prefix="/shipments", tags=["Shipment Orders & Ingestion"])
api_router.include_router(audit_router, prefix="/audit", tags=["Immutable Audit Trail"])
# from app.api.v1.copilot import router as copilot_router
# from app.api.v1.rag import router as rag_router
# from app.api.v1.analytics import router as analytics_router
# api_router.include_router(copilot_router, prefix="/copilot", tags=["LangGraph AI Copilot"])
# api_router.include_router(rag_router, prefix="/rag", tags=["RAG Compliance Engine"])
# api_router.include_router(analytics_router, prefix="/analytics", tags=["Operational Analytics"])
