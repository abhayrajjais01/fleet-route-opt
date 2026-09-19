"""
database.py - SQLAlchemy Database Connectivity & Session Management

This module sets up the relational database layer supporting both zero-config local development (SQLite)
and production enterprise cloud deployments (Supabase PostgreSQL / Render).
It exports the Base declarative class, SessionLocal factory, get_db() dependency, and health check utilities.
"""

from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

# Normalize connection string scheme:
# Convert legacy 'postgres://' (used by some cloud providers like Heroku/Render) to 'postgresql://' required by SQLAlchemy 2.0+
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Configure thread safety flags based on backend database engine:
# SQLite requires check_same_thread=False when handling multi-threaded FastAPI request workers
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# Create the primary SQLAlchemy Database Engine with pool_pre_ping enabled
# pool_pre_ping=True automatically tests connections before issuing queries, avoiding stale connection drops
engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,           # Set to True to print raw SQL statements during debugging
    pool_pre_ping=True,   # Automatic connection liveness validation
)

# SessionLocal: Factory class for generating isolated database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base: Declarative Base class from which all SQLAlchemy ORM models (User, Vehicle, Driver, Hub) inherit
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI Dependency: Yields a transactional database session per incoming HTTP request.
    Guarantees session cleanup (db.close()) when the request completes or raises an exception.
    
    Usage in FastAPI endpoints:
        @router.get("/vehicles")
        def list_vehicles(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """
    Diagnostic & Readiness Probe Utility: Executes a lightweight query (SELECT 1)
    to verify live database connectivity and returns connection metadata.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.scalar()
            dialect = engine.dialect.name
            return {
                "status": "healthy",
                "dialect": dialect,
                "database_url": db_url.split("@")[-1] if "@" in db_url else db_url.split("///")[-1],
                "error": None
            }
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return {
            "status": "unhealthy",
            "dialect": engine.dialect.name if hasattr(engine, "dialect") else "unknown",
            "database_url": None,
            "error": str(e)
        }
