import pytest

from app.core.database import normalize_database_url


@pytest.mark.parametrize(
    "url",
    [
        "postgres://user:pass@host:5432/fleet",
        "postgresql://user:pass@host:5432/fleet",
        "postgresql+psycopg://user:pass@host:5432/fleet",
        "postgresql+psycopg2://user:pass@host:5432/fleet",
    ],
)
def test_postgres_urls_are_pinned_to_installed_psycopg2_driver(url):
    assert normalize_database_url(url) == "postgresql+psycopg2://user:pass@host:5432/fleet"


def test_postgres_url_query_parameters_are_preserved():
    url = "postgresql+psycopg://user:pass@host:6543/postgres?sslmode=require"
    assert normalize_database_url(url) == "postgresql+psycopg2://user:pass@host:6543/postgres?sslmode=require"


@pytest.mark.parametrize("url", ["sqlite:///./fleet_opt.db", "sqlite:///:memory:"])
def test_sqlite_urls_are_unchanged(url):
    assert normalize_database_url(url) == url
