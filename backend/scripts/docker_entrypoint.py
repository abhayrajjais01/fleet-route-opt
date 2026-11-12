"""
docker_entrypoint.py - Container start-up for the backend image (Week 16).

1. Waits for the database to accept connections (PostgreSQL starts slower than the API container).
2. Creates/migrates the schema (same idempotent steps the app runs on startup).
3. Seeds demo users, fleet and shipments when SEED_DEMO_DATA=true (the seed script skips existing rows).
4. Execs uvicorn on $PORT, so signals go straight to the server.
"""

import os
import sys
import time

from app.core.database import Base, apply_database_migrations, check_database_connection, engine
from app.core.logging import logger
import app.models  # noqa: F401  (registers every table with Base.metadata)


def wait_for_database(timeout_s: int = 60) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        status = check_database_connection()
        if status.get("status") == "healthy":
            logger.info(f"Database ready ({status.get('dialect')}).")
            return
        if time.monotonic() > deadline:
            logger.error(f"Database not reachable after {timeout_s}s: {status.get('error')}")
            sys.exit(1)
        time.sleep(2)


def main() -> None:
    wait_for_database(int(os.environ.get("DB_WAIT_SECONDS", "60")))
    Base.metadata.create_all(bind=engine)
    apply_database_migrations()
    if os.environ.get("SEED_DEMO_DATA", "false").lower() in {"1", "true", "yes"}:
        from scripts.seed_demo_data import seed
        seed()
    port = os.environ.get("PORT", "8000")
    workers = os.environ.get("WEB_CONCURRENCY", "2")
    os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port, "--workers", workers, "--proxy-headers"])


if __name__ == "__main__":
    main()
