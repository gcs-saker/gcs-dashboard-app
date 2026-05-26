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


def test_reverse_proxy_documents_api_dashboard_and_media_routes() -> None:
    config = read_config()

    assert "upstream gcs_dashboard" in config
    assert "upstream gcs_backend" in config
    assert "upstream gcs_mediamtx_hls" in config
    assert "upstream gcs_mediamtx_webrtc" in config
    assert "location /api/" in config
    assert "location /hls/" in config
    assert "location /webrtc/" in config
    assert "proxy_pass http://gcs_dashboard;" in extract_locations(config, "/")[-1]


def test_reverse_proxy_keeps_mediamtx_management_ports_private() -> None:
    config = read_config()

    assert "9997" not in config
    assert "9998" not in config


def test_media_proxy_rewrites_public_prefixes_to_mediamtx_paths() -> None:
    config = read_config()

    hls_location = extract_location(config, "/hls/")
    webrtc_location = extract_location(config, "/webrtc/")

    assert "rewrite ^/hls/(.*)$ /$1 break;" in hls_location
    assert "proxy_pass http://gcs_mediamtx_hls;" in hls_location
    assert "rewrite ^/webrtc/(.*)$ /$1 break;" in webrtc_location
    assert "proxy_pass http://gcs_mediamtx_webrtc;" in webrtc_location


def test_reverse_proxy_policy_doc_covers_required_endpoint_decisions() -> None:
    doc = NGINX_DOC.read_text(encoding="utf-8")

    for term in [
        "HTTPS redirect",
        "WSS",
        "`https://<host>/api/`",
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


def extract_locations(config: str, path: str) -> list[str]:
    escaped_path = re.escape(path)
    return [
        match.group("body")
        for match in re.finditer(rf"location {escaped_path} \{{(?P<body>.*?)\n        \}}", config, re.DOTALL)
    ]
