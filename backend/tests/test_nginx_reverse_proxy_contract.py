from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[2]
NGINX_PROXY_CONFIG = REPO_ROOT / "deploy" / "nginx" / "gcs-saker.reverse-proxy.example.conf"
NGINX_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Nginx_HTTPS_WSS_reverse_proxy_v0.1.md"


def read_config() -> str:
    return NGINX_PROXY_CONFIG.read_text(encoding="utf-8")


def test_reverse_proxy_config_draft_exists() -> None:
    assert NGINX_PROXY_CONFIG.is_file()


def test_reverse_proxy_declares_https_redirect_and_tls_server() -> None:
    config = read_config()

    assert "listen 80;" in config
    assert "return 301 https://$host$request_uri;" in config
    assert "listen 443 ssl;" in config
    assert "http2 on;" in config
    assert "ssl_certificate /etc/nginx/certs/fullchain.pem;" in config
    assert "ssl_certificate_key /etc/nginx/certs/privkey.pem;" in config


def test_reverse_proxy_preserves_websocket_upgrade_headers() -> None:
    config = read_config()

    assert "map $http_upgrade $connection_upgrade" in config
    ws_location = extract_location(config, "/ws/")
    assert "proxy_set_header Upgrade $http_upgrade;" in ws_location
    assert "proxy_set_header Connection $connection_upgrade;" in ws_location
    assert "proxy_read_timeout 3600s;" in ws_location


def test_reverse_proxy_sets_browser_security_headers() -> None:
    config = read_config()

    assert 'add_header X-Frame-Options DENY always;' in config
    assert 'add_header X-Content-Type-Options nosniff always;' in config
    assert "frame-ancestors 'none'" in config
    assert "object-src 'none'" in config
    assert "connect-src 'self' https: wss: stun: turn:;" in config
    assert 'add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(self)" always;' in config


def test_reverse_proxy_documents_api_dashboard_and_media_routes() -> None:
    config = read_config()

    assert "upstream gcs_dashboard" in config
    assert "server dashboard:3000;" in config
    assert "upstream gcs_backend" in config
    assert "upstream gcs_auth_policy" in config
    assert "upstream gcs_media_control" in config
    assert "upstream gcs_mediamtx_hls" in config
    assert "upstream gcs_mediamtx_webrtc" in config
    assert "resolver 127.0.0.11 valid=10s ipv6=off;" in config
    assert "location /api/auth/" in config
    assert "location /auth-policy/" in config
    assert "location /media-control/" in config
    assert "location /api/control/" in config
    assert "location /api/asset/" in config
    assert "location = /api/telemetry/all" in config
    assert "location /api/telemetry/" in config
    assert "location /api/ops/" in config
    assert "location /api/stream/" in config
    assert "location /stream/" in config
    assert "location /api/" in config
    assert "location /hls/" in config
    assert "location /webrtc/" in config
    assert "proxy_pass http://gcs_dashboard;" in extract_locations(config, "/")[-1]


def test_reverse_proxy_routes_root_health_checks_to_auth_policy() -> None:
    config = read_config()

    healthz_location = extract_exact_location(config, "/healthz")
    readyz_location = extract_exact_location(config, "/readyz")

    assert "proxy_pass http://gcs_auth_policy/healthz;" in healthz_location
    assert "proxy_pass http://gcs_auth_policy/readyz;" in readyz_location
    assert "proxy_read_timeout 10s;" in healthz_location
    assert "proxy_read_timeout 10s;" in readyz_location


def test_reverse_proxy_keeps_mediamtx_management_ports_private() -> None:
    config = read_config()

    assert "9997" not in config
    assert "9998" not in config


def test_media_proxy_rewrites_public_prefixes_to_mediamtx_paths() -> None:
    config = read_config()

    hls_location = extract_location(config, "/hls/")
    webrtc_location = extract_location(config, "/webrtc/")

    assert "rewrite ^/hls/(.*)$ /$1 break;" in hls_location
    assert 'set $gcs_mediamtx_hls "mediamtx:8888";' in hls_location
    assert "proxy_pass http://$gcs_mediamtx_hls;" in hls_location
    assert "rewrite ^/webrtc/(.*)$ /$1 break;" in webrtc_location
    assert 'set $gcs_mediamtx_webrtc "mediamtx:8889";' in webrtc_location
    assert "proxy_pass http://$gcs_mediamtx_webrtc;" in webrtc_location


def test_auth_proxy_rewrites_dashboard_api_auth_prefix_to_backend_auth_router() -> None:
    config = read_config()
    auth_location = extract_location(config, "/api/auth/")

    assert "Legacy fallback only" in auth_location
    assert "rewrite ^/api/auth/(.*)$ /auth/$1 break;" in auth_location
    assert "proxy_pass http://gcs_backend;" in auth_location
    assert "proxy_read_timeout 60s;" in auth_location


def test_auth_policy_cutover_prefix_rewrites_to_spring_auth_policy() -> None:
    config = read_config()
    auth_policy_location = extract_location(config, "/auth-policy/")

    assert "rewrite ^/auth-policy/(.*)$ /$1 break;" in auth_policy_location
    assert "proxy_pass http://gcs_auth_policy;" in auth_policy_location
    assert "proxy_read_timeout 60s;" in auth_policy_location


def test_media_control_cutover_prefix_rewrites_to_go_media_control() -> None:
    config = read_config()
    media_control_location = extract_location(config, "/media-control/")

    assert "rewrite ^/media-control/(.*)$ /$1 break;" in media_control_location
    assert "proxy_pass http://gcs_media_control;" in media_control_location
    assert "proxy_read_timeout 60s;" in media_control_location


def test_legacy_api_prefixes_are_rewritten_to_backend_routers() -> None:
    config = read_config()

    expected_rewrites = {
        "/api/control/": "rewrite ^/api/control/(.*)$ /control/$1 break;",
    }
    for public_prefix, rewrite in expected_rewrites.items():
        location = extract_location(config, public_prefix)
        assert rewrite in location
        assert "proxy_pass http://gcs_backend;" in location


def test_legacy_control_prefix_is_marked_as_future_command_fallback() -> None:
    config = read_config()
    control_location = extract_location(config, "/api/control/")

    assert "Future/legacy command fallback" in control_location
    assert "proxy_pass http://gcs_backend;" in control_location


def test_read_only_asset_telemetry_and_ops_paths_are_cut_over_to_auth_policy() -> None:
    config = read_config()
    asset_location = extract_location(config, "/api/asset/")
    telemetry_all_location = extract_exact_location(config, "/api/telemetry/all")
    telemetry_location = extract_location(config, "/api/telemetry/")
    ops_location = extract_location(config, "/api/ops/")

    assert "rewrite ^/api/asset/(.*)$ /asset/$1 break;" in asset_location
    assert "proxy_pass http://gcs_auth_policy;" in asset_location
    assert "proxy_pass http://gcs_auth_policy/telemetry/all;" in telemetry_all_location
    assert "rewrite ^/api/telemetry/(.*)$ /telemetry/$1 break;" in telemetry_location
    assert "proxy_pass http://gcs_auth_policy;" in telemetry_location
    assert "rewrite ^/api/ops/(.*)$ /ops/$1 break;" in ops_location
    assert "proxy_pass http://gcs_auth_policy;" in ops_location


def test_legacy_stream_prefix_is_cut_over_to_go_media_control_for_runtime_smoke() -> None:
    config = read_config()
    api_stream_location = extract_location(config, "/api/stream/")
    stream_location = extract_location(config, "/stream/")

    assert "rewrite ^/api/stream/(.*)$ /stream/$1 break;" in api_stream_location
    assert "proxy_pass http://gcs_media_control;" in api_stream_location
    assert "proxy_pass http://gcs_media_control;" in stream_location
    for location in (api_stream_location, stream_location):
        assert 'add_header Deprecation "true" always;' in location
        assert 'add_header X-GCS-Replacement-Route "/media-control/api/v1/streams" always;' in location


def test_legacy_stream_prefix_keeps_short_runtime_timeout() -> None:
    config = read_config()
    location = extract_location(config, "/stream/")

    assert "proxy_read_timeout 60s;" in location


def test_versioned_api_prefix_stays_on_backend_api_namespace() -> None:
    config = read_config()
    api_location = extract_location(config, "/api/")

    assert "rewrite ^/api/v1/" not in api_location
    assert "proxy_pass http://gcs_backend;" in api_location


def test_reverse_proxy_policy_doc_covers_required_endpoint_decisions() -> None:
    doc = NGINX_DOC.read_text(encoding="utf-8")

    for term in [
        "HTTPS redirect",
        "WSS",
        "`https://<host>/api/`",
        "`https://<host>/api/asset/*`",
        "`https://<host>/api/telemetry/all`",
        "`https://<host>/hls/<stream>/index.m3u8`",
        "`https://<host>/webrtc/<stream>/whep`",
        "STUN/TURN 서버는 Nginx가 proxy하지 않는다",
        "MediaMTX API `9997`과 metrics `9998`은 외부 공개 경로를 만들지 않는다",
    ]:
        assert term in doc


def extract_location(config: str, path: str) -> str:
    locations = extract_locations(config, path)
    assert locations, f"location {path} not found"
    return locations[0]


def extract_exact_location(config: str, path: str) -> str:
    escaped_path = re.escape(path)
    match = re.search(rf"location = {escaped_path} \{{(?P<body>.*?)\n        \}}", config, re.DOTALL)
    assert match, f"exact location {path} not found"
    return match.group("body")


def extract_locations(config: str, path: str) -> list[str]:
    escaped_path = re.escape(path)
    return [
        match.group("body")
        for match in re.finditer(rf"location {escaped_path} \{{(?P<body>.*?)\n        \}}", config, re.DOTALL)
    ]
