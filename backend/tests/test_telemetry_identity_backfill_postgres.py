import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg2
import pytest

from tests.test_telemetry_identity_backfill import load_backfill

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def identity_connection():
    dsn = os.environ.get("TEST_TELEMETRY_POSTGRES_DSN")
    if not dsn:
        pytest.skip("disposable PostgreSQL identity fixture not configured")
    assert urlsplit(dsn).path.lstrip("/") in {"gcs_ownership_smoke", "gcs_identity_backfill_smoke"}
    connection = psycopg2.connect(dsn.replace("postgresql+psycopg2://", "postgresql://", 1), connect_timeout=3)
    created = False
    try:
        with connection, connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA identity_backfill_fixture")
            created = True
            cursor.execute("SET search_path = identity_backfill_fixture")
            cursor.execute("CREATE TABLE telemetry_history (event_id VARCHAR(160), payload INTEGER)")
            cursor.execute("CREATE UNIQUE INDEX ux_telemetry_history_event_id ON telemetry_history (event_id)")
            cursor.execute("INSERT INTO telemetry_history (payload) SELECT generate_series(1, 5)")
            cursor.execute(
                (
                    ROOT
                    / "services/auth-policy/src/main/resources/db/postgresql-migration/V36__telemetry_history_identity_staging.sql"
                ).read_text(encoding="utf-8")
            )
        yield connection
    finally:
        if created:
            with connection, connection.cursor() as cursor:
                cursor.execute("DROP SCHEMA IF EXISTS identity_backfill_fixture CASCADE")
        connection.close()


def test_backfill_resumes_without_duplication_and_finalizes_the_existing_unique_index(identity_connection):
    module = load_backfill()
    with pytest.raises(psycopg2.IntegrityError), identity_connection, identity_connection.cursor() as cursor:
        cursor.execute("INSERT INTO telemetry_history (event_id, payload) VALUES (NULL, 99)")

    first = module.backfill(identity_connection, module.BackfillOptions(True, False, True, 2, 1))
    assert first["updated"] == 2
    assert first["pending"] is True
    assert first["complete"] is False
    assert first["finalization"] == "NOT_RUN"

    completed = module.backfill(identity_connection, module.BackfillOptions(True, True, True, 2, 10))
    assert completed["updated"] == 3
    assert completed["complete"] is True
    assert completed["primaryKeyReady"] is True
    replay = module.backfill(identity_connection, module.BackfillOptions(True, True, True, 2, 10))
    assert replay["updated"] == 0
    assert replay["complete"] is True
    with identity_connection, identity_connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*), COUNT(DISTINCT event_id), SUM(payload) FROM telemetry_history")
        assert cursor.fetchone() == (5, 5, 15)
