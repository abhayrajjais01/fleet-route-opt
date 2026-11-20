"""
main.py - Primary Application Entrypoint for FastAPI Backend

This file initializes the FastAPI application instance, configures CORS middleware for frontend communication,
manages startup/shutdown lifespans (database connection checks and ORM table creation), and mounts API routers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.http_security import (
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    default_buckets,
)
from app.core.logging import logger
from app.core.database import Base, engine, check_database_connection, apply_database_migrations
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Manager: Executes startup logic before accepting requests
    and shutdown logic when the server process terminates.
    """
    logger.info(f"Initializing {settings.APP_NAME} [{settings.APP_ENV}]...")
    try:
        # Step 1: Verify database connection status and dialect (SQLite vs PostgreSQL)
        db_status = check_database_connection()
        logger.info(f"Database dialect: {db_status['dialect']}, status: {db_status['status']}")
        
        # Step 2: Auto-create ORM database tables defined in app/models/ if they do not exist
        Base.metadata.create_all(bind=engine)
        apply_database_migrations()
        logger.info("Database schemas verified & synchronized.")
    except Exception as e:
        logger.error(f"Database startup initialization error: {e}", exc_info=True)
    
    # Control passes to the application to handle incoming HTTP requests
    yield
    
    # Shutdown logic executed when server closes
    logger.info(f"Shutting down {settings.APP_NAME}...")


# Tag descriptions shown as section intros in /docs (Week 16 OpenAPI polish)
OPENAPI_TAGS = [
    {"name": "Health & System", "description": "Liveness and readiness probes used by Docker, Render and the frontend status pill."},
    {"name": "Fleet Asset Management", "description": "Hubs, vehicles and drivers: the constraints every route is planned against."},
    {"name": "RAG Compliance Engine", "description": "Search the verified SOP knowledge base. Every result is a cited, verbatim passage."},
    {"name": "Route Optimization (VRPTW)", "description": "Distance matrix, VRPTW solver, resequencing evaluation, downstream ETAs, SLA checks, "
                                                         "route explanations and the disruption-handling Optimization Agent."},
    {"name": "Operational Reports & Exports", "description": "OTIF, transit, efficiency, fuel and cost KPIs with CSV and PDF exports."},
    {"name": "Authentication & RBAC", "description": "JWT login and role-based access control."},
    {"name": "Shipment Orders & Ingestion", "description": "Shipment CRUD and CSV/JSON batch ingestion."},
    {"name": "Immutable Audit Trail", "description": "Append-only log of every state change and override."},
    {"name": "LangGraph AI Copilot", "description": "Multi-agent StateGraph copilot for dispatcher questions."},
    {"name": "In-Transit FSM & Telemetry Tracking", "description": "Shipment lifecycle state machine and driver actions."},
]

# Create the core FastAPI instance with metadata and OpenAPI docs configuration
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Enterprise-grade AI solution for Fleet Route Optimization combining deterministic "
        "graph algorithms (DSA/VRPTW) with multi-agent generative AI (LangGraph) and RAG "
        "grounded in logistics SOPs."
    ),
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
    docs_url="/docs",      # Interactive Swagger UI endpoint at /docs
    redoc_url="/redoc",    # Alternative ReDoc documentation endpoint at /redoc
)

# ─── Middleware (Week 14 hardening) ───────────────────────────────────────────────────────────
# Starlette runs the most recently added middleware first, so a request passes
#   CORS -> body-size limit -> security headers -> rate limit -> routes.
# CORS is outermost so that 413 and 429 responses also carry CORS headers and the browser can show them.
app.add_middleware(
    RateLimitMiddleware,
    buckets=default_buckets(settings.API_V1_STR, settings.RATE_LIMIT_AUTH_PER_MIN, settings.RATE_LIMIT_AI_PER_MIN,
                            settings.RATE_LIMIT_EXPORT_PER_MIN, settings.RATE_LIMIT_DEFAULT_PER_MIN),
    enabled=settings.RATE_LIMIT_ENABLED,
    trust_proxy=settings.TRUST_PROXY_HEADERS,
)
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.APP_ENV == "production")
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_BYTES)
# CORS: the Vite dev server (localhost:3000), and this project's Vercel deployments. The Docker stack serves the
# frontend and proxies /api from one Nginx origin, so it needs no CORS at all. Methods and headers are explicit,
# and the download / rate-limit headers the frontend reads are exposed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=settings.BACKEND_CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Content-Disposition", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    max_age=600,
)


@app.get("/", tags=["Root"])
def root():
    """
    Root Discovery Endpoint: Provides basic metadata, documentation paths, and health probe URLs.
    """
    return {
        "app": settings.APP_NAME,
        "version": "0.1.0",
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "ready": f"{settings.API_V1_STR}/ready",
    }


# Mount all Version 1 API routes under prefix /api/v1 (e.g., /api/v1/auth, /api/v1/fleet)
app.include_router(api_router, prefix=settings.API_V1_STR)


# Direct execution entrypoint when launching via python -m app.main
if __name__ == "__main__":
    import uvicorn
    # Start Uvicorn ASGI server on port 8000 with auto-reload enabled for development
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
