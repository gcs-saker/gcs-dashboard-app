import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_runtime_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "smoke" / "m7_single_node_runtime_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 single-node runtime smoke check passed" in result.stdout


def test_m7_runtime_smoke_ports_override_public_playback_urls():
    script = (REPO_ROOT / "scripts" / "smoke" / "m7_single_node_runtime_smoke.sh").read_text(encoding="utf-8")

    assert "MEDIAMTX_PUBLIC_WEBRTC_BASE_URL" in script
    assert "MEDIAMTX_PUBLIC_HLS_BASE_URL" in script
    assert "MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL" in script
    assert "MEDIA_CONTROL_PUBLIC_HLS_BASE_URL" in script
    assert "AUTH_POLICY_BASE_URL" in script
    assert "MEDIA_CONTROL_STREAM_GROUP_MAP" in script
    assert "VITE_AUTH_API_BASE_URL" in script
    assert "VITE_STREAM_API_BASE_URL" in script
    assert "VITE_LOCAL_WEBCAM_WHIP_URL" in script
    assert "BACKEND_CORS_ALLOW_ORIGINS" in script
    assert "WEBRTC_STUN_URL" in script
    assert "WEBRTC_TURN_URL" in script
    assert "VITE_WEBRTC_STUN_URL" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT}/webrtc" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT}/hls" in script
    assert "/media-control" in script
    assert "/auth-policy/auth" in script
    assert "stun:127.0.0.1:${TURN_PRIMARY_HOST_PORT}" in script
    assert "turn:127.0.0.1:${TURN_PRIMARY_HOST_PORT}?transport=udp" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT},http://localhost:${PUBLIC_HTTP_PORT}" in script


def test_m7_runtime_smoke_requires_backend_stream_status_payload_and_read_model_probe():
    script = (REPO_ROOT / "scripts" / "smoke" / "m7_single_node_runtime_smoke.sh").read_text(encoding="utf-8")

    assert "wait_for_stream_status" in script
    assert '"stream":"ready"' in script
    assert "media-control stream readiness" in script
    assert "backend stream readiness" not in script
    assert 'add_header Deprecation "true" always;' in script
    assert 'X-GCS-Replacement-Route "/media-control/api/v1/streams"' in script
    assert "login_access_token" in script
    assert '"raw.smoke.telemetry"' in script
    assert "/api/telemetry/all" in script
    assert "/api/telemetry/" in script
    assert "/api/asset/raw.sample.front" in script
    assert "expect_http_status" in script
    assert '"raw.unauthorized.telemetry"' in script
    assert "compose restart edge" in script
    assert "auth-policy health/ready/telemetry ingest-read/asset reads" in script
    assert "unauthenticated telemetry rejection" in script
    assert "media-control stream status" in script
    assert "Verified active cutover" in script
    assert "verify edge/backend/auth" not in script
    for legacy_path in ("/api/control/", "/api/v1/ai/mock/detections", "/metrics", "/ws/"):
        assert legacy_path not in script


def test_mediamtx_additional_hosts_are_env_driven_for_public_nat_candidates():
    deploy_config = (REPO_ROOT / "deploy" / "mediamtx" / "mediamtx.closed-network.yml").read_text(encoding="utf-8")
    dashboard_config = (REPO_ROOT / "gcs-dashboard" / "mediamtx.yml").read_text(encoding="utf-8")
    single_node_compose = (REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")
    dashboard_compose = (REPO_ROOT / "gcs-dashboard" / "docker-compose.yml").read_text(encoding="utf-8")
    single_node_env = (REPO_ROOT / "deploy" / "compose" / ".env.single-node.example").read_text(encoding="utf-8")

    assert "webrtcAdditionalHosts: []" in deploy_config
    assert "webrtcAdditionalHosts: []" in dashboard_config
    expected_override = "MTX_WEBRTCADDITIONALHOSTS: ${MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS:-127.0.0.1}"
    expected_interface_override = "MTX_WEBRTCIPSFROMINTERFACES: ${MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES:-true}"
    assert expected_override in single_node_compose
    assert expected_override in dashboard_compose
    assert expected_interface_override in single_node_compose
    assert expected_interface_override in dashboard_compose
    assert "MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES=true" in single_node_env
    assert "MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS=127.0.0.1" in single_node_env
    assert deploy_config.count("clientOnly: true") == 2
