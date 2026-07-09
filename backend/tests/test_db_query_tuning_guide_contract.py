from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GUIDE = REPO_ROOT / "docs" / "operations" / "GCS-Saker_DB_Query_Tuning_Guide_v0.1.md"


def test_db_query_tuning_guide_documents_orm_query_strategy() -> None:
    content = GUIDE.read_text(encoding="utf-8")

    required_phrases = [
        "ORM / Query Builder / Raw SQL 선택 기준",
        "JPA repository / SQLAlchemy ORM",
        "QueryDSL/Specification",
        "Raw SQL/JdbcTemplate",
        "keyset pagination",
        "N+1",
        "Transaction 기준",
        "EXPLAIN / EXPLAIN ANALYZE",
        "JdbcOperationalEventRepository.metricsFor",
    ]
    for phrase in required_phrases:
        assert phrase in content
