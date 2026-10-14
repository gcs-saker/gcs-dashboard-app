import os
import re
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer.buffer import TelemetryBufferRecord
from modules.telemetry_buffer.bulk_sql import TelemetryBulkBatch, build_postgres_history_bulk_insert

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def isolated_postgres():
    dsn = os.environ.get("TEST_TELEMETRY_POSTGRES_DSN")
    if not dsn:
        pytest.skip("disposable PostgreSQL ownership fixture not configured")
    assert make_url(dsn).database == "gcs_ownership_smoke", "requires a disposable named test database"
    engine = create_engine(dsn, connect_args={"connect_timeout": 2}, pool_timeout=2)
    try:
        for attempt in range(20):
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT 1"))
                break
            except OperationalError:
                if attempt == 19:
                    raise
                time.sleep(0.5)
        migration = (
            ROOT / "services/auth-policy/src/main/resources/db/migration/V1__auth_policy_core_schema.sql"
        ).read_text(encoding="utf-8")
        canonical = re.search(r"CREATE TABLE IF NOT EXISTS telemetry_history \(.*?\n\);", migration, re.DOTALL)
        assert canonical is not None
        compatibility = (ROOT / "deploy/postgres/backend-compat-telemetry.sql").read_text(encoding="utf-8")
        with engine.connect() as connection:
            connection.exec_driver_sql(canonical.group())
            connection.commit()
            connection.exec_driver_sql(compatibility)
            connection.exec_driver_sql(compatibility)
        yield engine
    finally:
        engine.dispose()


def test_legacy_bulk_insert_cannot_write_into_canonical_history(isolated_postgres):
    batch = TelemetryBulkBatch.from_records(
        [
            TelemetryBufferRecord.create(TelemetryCreate(uuid="ownership-fixture-a", latitude=35.8)),
            TelemetryBufferRecord.create(TelemetryCreate(uuid="ownership-fixture-b", latitude=35.9)),
        ]
    )
    with isolated_postgres.begin() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '3s'"))
        connection.execute(build_postgres_history_bulk_insert(batch))
        assert connection.execute(text("SELECT COUNT(*) FROM backend_compat.telemetry_history")).scalar_one() == 2
        assert connection.execute(text("SELECT COUNT(*) FROM public.telemetry_history")).scalar_one() == 0
    canonical_columns = {
        column["name"] for column in inspect(isolated_postgres).get_columns("telemetry_history", schema="public")
    }
    assert {"uuid", "recorded_at", "group_id"} <= canonical_columns
    assert "stream_uuid" not in canonical_columns
