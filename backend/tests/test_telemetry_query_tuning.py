from sqlalchemy.dialects import postgresql

from api.telemetry import _build_postgres_telemetry_upsert


def test_postgres_telemetry_upsert_uses_single_atomic_statement() -> None:
    statement = _build_postgres_telemetry_upsert(
        {
            "uuid": "raw.local.webcam",
            "latitude": 35.8714,
            "longitude": 128.6014,
            "epochTime": 1000,
        }
    )

    compiled = str(statement.compile(dialect=postgresql.dialect()))

    assert compiled.startswith("INSERT INTO telemetry_realtime")
    assert "ON CONFLICT (uuid) DO UPDATE" in compiled
    assert "SELECT" not in compiled
