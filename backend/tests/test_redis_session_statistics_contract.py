from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_session_statistics_use_counters_and_sorted_sets_without_scan() -> None:
    statistics = (ROOT / "services/media-control/internal/sessionstore/statistics.go").read_text(encoding="utf-8")
    store = (ROOT / "services/media-control/internal/sessionstore/redis.go").read_text(encoding="utf-8")

    assert ".Scan(" not in statistics
    assert "HGetAll" not in statistics
    assert "HINCRBY" in statistics or "HINCRBY" in store
    assert "ZRANGEBYSCORE" in statistics
    assert "'LIMIT', 0, ARGV[2]" in statistics
    assert "statisticsExpiryKey" in store


def test_rate_limit_cleanup_is_bounded_and_alert_state_is_removed() -> None:
    limiter = (
        ROOT / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/shared/RateLimitFilter.kt"
    ).read_text(encoding="utf-8")
    alerts = (
        ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/domain/operations/TelemetryAlertRuleEngine.kt"
    ).read_text(encoding="utf-8")

    assert "entries.removeIf" not in limiter
    assert "MAX_EXPIRY_CLEANUP_PER_REQUEST = 64" in limiter
    assert "clearDeviceRules" in alerts
