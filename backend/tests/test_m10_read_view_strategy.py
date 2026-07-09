from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
READ_VIEW_DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M10_read_view_strategy.md"
READ_VIEW_MIGRATION = (
    REPO_ROOT
    / "services"
    / "auth-policy"
    / "src"
    / "main"
    / "resources"
    / "db"
    / "migration"
    / "V4__operational_read_views.sql"
)
READ_SQL = (
    REPO_ROOT
    / "services"
    / "auth-policy"
    / "src"
    / "main"
    / "kotlin"
    / "kr"
    / "co"
    / "a4ai"
    / "gcssaker"
    / "authpolicy"
    / "infrastructure"
    / "persistence"
    / "JdbcOperationalReadSql.kt"
)


def test_m10_read_view_strategy_documents_candidate_and_exclusion_boundaries() -> None:
    doc = READ_VIEW_DOC.read_text(encoding="utf-8")

    assert "DB View를 전면 도입하지 않고" in doc
    assert "Telemetry 최신값 | 제외" in doc
    assert "WebRTC signaling/media | 제외" in doc
    assert "Refresh token/session write | 제외" in doc
    assert "PostGIS 위치/거리/영역 조회 | 후보" in doc
    assert "Redis Cache" in doc
    assert "Materialized View" in doc


def test_m10_first_read_view_uses_windowed_latest_stream_session_projection() -> None:
    migration = READ_VIEW_MIGRATION.read_text(encoding="utf-8")
    read_sql = READ_SQL.read_text(encoding="utf-8")

    assert "DROP VIEW IF EXISTS operational_stream_session_latest" in migration
    assert "CREATE VIEW operational_stream_session_latest" in migration
    assert "ROW_NUMBER() OVER" in migration
    assert "PARTITION BY group_id, stream_id, COALESCE(session_id, '')" in migration
    assert "ORDER BY last_heartbeat_at DESC, id DESC" in migration
    assert "FROM operational_stream_session_latest" in read_sql
    assert "NOT EXISTS" not in read_sql.split("const val selectLatestStreamSessions", 1)[1]
