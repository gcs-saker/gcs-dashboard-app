from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
COMPLETION_GATE_DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M7_migration_completion_gate.md"
SMOKE_SCRIPT = REPO_ROOT / "scripts" / "m7_single_node_runtime_smoke.sh"
NGINX_CONFIG = REPO_ROOT / "deploy" / "nginx" / "gcs-saker.reverse-proxy.example.conf"


def test_m7_completion_gate_defines_active_runtime_paths_without_python_backend() -> None:
    doc = COMPLETION_GATE_DOC.read_text(encoding="utf-8")

    for active_term in [
        "Spring/Kotlin auth-policy",
        "Go media-control",
        "MediaMTX",
        "coturn",
        "`/api/telemetry/`, `/api/telemetry/all`",
        "`/api/asset/*`",
        "Active runtime path가 Python backend 없이 통과하면",
    ]:
        assert active_term in doc


def test_m7_completion_gate_isolates_legacy_and_future_python_paths() -> None:
    doc = COMPLETION_GATE_DOC.read_text(encoding="utf-8")

    for legacy_term in [
        "`/api/auth/*` | Python backend | v0.2.0 호환 fallback",
        "`/api/v1/map/config` | Python backend | 지도 설정이 auth-policy read-model로 이동하기 전까지 exact allowlist",
        "`/api/control/*` | Edge disabled | 실제 장비 제어 정책이 확정될 때까지 public edge에서는 broad fallback",
        "`/api/v1/ai/mock/detections` | Edge disabled | 실제 AI overlay server 연동 전 mock contract",
        "`/metrics` | Edge disabled | 신규 서비스별 metrics 설계 전까지 public edge에는 공개하지 않는다",
        "`/ws/*` | Edge disabled | WebSocket contract가 확정될 때까지 public edge에서는 410으로 닫는다",
        "구현 전 기능은 언어 전환 완료의 blocker로 보지 않는다",
    ]:
        assert legacy_term in doc


def test_m7_runtime_smoke_checks_active_cutover_only() -> None:
    script = SMOKE_SCRIPT.read_text(encoding="utf-8")

    for active_probe in [
        "/healthz",
        "/readyz",
        "/stream/status",
        "/api/telemetry/",
        "/api/telemetry/all",
        "/api/asset/raw.sample.front",
        "http://auth-policy:8080/healthz",
        "http://media-control:8081/healthz",
        "http://media-control:8081/api/v1/streams/ice-servers",
        "http://mediamtx:9997/v3/config/global/get",
        "Verified active cutover",
    ]:
        assert active_probe in script

    for future_or_legacy_probe in [
        "/api/control/",
        "/api/v1/ai/mock/detections",
        "/metrics",
        "/ws/",
        "verify edge/backend/auth",
    ]:
        assert future_or_legacy_probe not in script


def test_nginx_contract_keeps_legacy_backend_fallbacks_outside_active_gate() -> None:
    config = NGINX_CONFIG.read_text(encoding="utf-8")

    assert "location = /api/v1/map/config" in config
    assert "location /api/control/" in config
    assert 'add_header X-GCS-Legacy-Fallback "disabled" always;' in config
    assert "return 410;" in config
    assert "proxy_pass http://gcs_backend;" in config
    assert "proxy_pass http://gcs_auth_policy;" in config
    assert "proxy_pass http://gcs_media_control;" in config
