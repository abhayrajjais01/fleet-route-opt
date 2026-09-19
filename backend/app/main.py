"""
main.py - Primary Application Entrypoint for FastAPI Backend

This file initializes the FastAPI application instance, configures CORS middleware for frontend communication,
manages startup/shutdown lifespans (database connection checks and ORM table creation), and mounts API routers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.core.database import Base, engine, check_database_connection
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
        logger.info("Database schemas verified & synchronized.")
    except Exception as e:
        logger.error(f"Database startup initialization error: {e}", exc_info=True)
    
    # Control passes to the application to handle incoming HTTP requests
    yield
    
    # Shutdown logic executed when server closes
    logger.info(f"Shutting down {settings.APP_NAME}...")


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
    docs_url="/docs",      # Interactive Swagger UI endpoint at /docs
    redoc_url="/redoc",    # Alternative ReDoc documentation endpoint at /redoc
)

# CORS (Cross-Origin Resource Sharing) Middleware Setup
# Allows frontend applications (Next.js on localhost:3000 or deployed on Vercel) to interact with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,  # Whitelisted origin URLs
    allow_origin_regex=r"https://.*\.vercel\.app", # Whitelists Vercel preview & production deployments
    allow_credentials=True,                        # Allows sending authorization headers & cookies
    allow_methods=["*"],                           # Permits all HTTP verbs (GET, POST, PUT, DELETE, OPTIONS)
    allow_headers=["*"],                           # Permits all incoming headers
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
