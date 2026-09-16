from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

# Normalize postgres:// to postgresql:// for SQLAlchemy compatibility (e.g. from Supabase / Render)
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# SQLite thread safety configuration
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# Create database engine with pooling
engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency providing a transactional database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """Verifies live database connectivity and returns metadata."""
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
