from sqlalchemy.dialects import mysql

from api.telemetry import _build_mysql_telemetry_upsert


def test_mysql_telemetry_upsert_uses_single_atomic_statement() -> None:
    statement = _build_mysql_telemetry_upsert(
        {
            "uuid": "raw.local.webcam",
            "latitude": 35.8714,
            "longitude": 128.6014,
            "epochTime": 1000,
        }
    )

    compiled = str(statement.compile(dialect=mysql.dialect()))

    assert compiled.startswith("INSERT INTO telemetry_realtime")
    assert "ON DUPLICATE KEY UPDATE" in compiled
    assert "SELECT" not in compiled
