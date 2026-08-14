from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OPENAPI = REPO_ROOT / "services/auth-policy/src/main/resources/openapi/gcs-saker-operations.openapi.yaml"
AUTH_SECURITY = (
    REPO_ROOT
    / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/identity/AuthSecurityRouteContract.kt"
)
EDGE_CONFIG = REPO_ROOT / "deploy/nginx/single-node.poc.conf"


PUBLIC_EDGE_PATHS = (
    "/auth-policy/auth/signup",
    "/auth-policy/auth/login",
    "/auth-policy/auth/refresh",
    "/auth-policy/auth/me",
    "/auth-policy/auth/logout",
    "/auth-policy/api/v1/signup-tokens",
    "/auth-policy/api/v1/provisioning-tokens",
    "/auth-policy/api/v1/devices",
    "/api/v1/groups",
    "/api/v1/geofences",
    "/api/telemetry/all",
    "/api/telemetry/{uuid}/history",
    "/api/asset/{gatewayUuid}",
    "/api/ops/server-health/snapshots",
    "/api/ops/stream-sessions",
    "/api/ops/stream-sessions/stream",
    "/api/ops/events",
    "/api/ops/events/page",
    "/api/ops/events/stream",
    "/api/ops/events/metrics",
    "/api/ops/events/buckets",
    "/api/ops/time/status",
    "/api/ops/time/check",
    "/api/ops/time/config",
    "/media-control/healthz",
    "/media-control/readyz",
    "/media-control/api/v1/streams",
    "/media-control/api/v1/streams/ice-servers",
    "/media-control/api/v1/streams/{streamId}",
    "/media-control/api/v1/streams/{streamId}/playback",
    "/media-control/api/v1/streams/{streamId}/publish",
    "/media-control/api/v1/streams/{streamId}/status",
    "/media-control/api/v1/device/publish-sessions",
    "/media-control/api/v1/account/publish-sessions",
    "/api/v1/device/publish-sessions",
    "/api/v1/devices/{deviceUuid}/telemetry",
    "/gcs.saker.v1.SakerGatewayService/Exchange",
    "/webrtc/{streamPath}/whip",
    "/webrtc/{streamPath}/whep",
    "/hls/{streamPath}/index.m3u8",
    "/ws/v1/telemetry",
)


def test_operational_openapi_covers_public_edge_contracts() -> None:
    document = OPENAPI.read_text(encoding="utf-8")

    for path in PUBLIC_EDGE_PATHS:
        assert f"  {path}:" in document, f"missing operational API path: {path}"


def test_operational_swagger_exposes_sanitized_spec_and_keeps_ui_read_only() -> None:
    security = AUTH_SECURITY.read_text(encoding="utf-8")
    controller = (
        REPO_ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/operations/documentation/OperationalApiDocumentationController.kt"
    ).read_text(encoding="utf-8")
    initializer = (
        REPO_ROOT / "services/auth-policy/src/main/resources/openapi/gcs-saker-operations-swagger.js"
    ).read_text(encoding="utf-8")
    swagger = (
        REPO_ROOT / "services/auth-policy/src/main/resources/openapi/gcs-saker-operations-swagger.html"
    ).read_text(encoding="utf-8")

    assert "val ADMIN_MATCHERS = emptyList<RouteMatcher>()" in security
    assert 'const val ROOT = "/admin/api-docs"' in controller
    assert "OperationalApiDocumentationRoutes.OPENAPI" in security
    assert "OperationalApiDocumentationRoutes.INITIALIZER" in security
    assert "OperationalApiDocumentationRoutes.FLOW_STYLES" in security
    assert "supportedSubmitMethods: []" in initializer
    assert "persistAuthorization: false" in initializer
    assert "request.headers.Authorization" not in initializer
    assert "window.prompt" not in initializer
    assert 'url: "/auth-policy/admin/api-docs/openapi.yaml"' in initializer
    assert "noindex,nofollow,noarchive" in swagger
    assert "OpenAPI 명세를 불러오는 중" not in swagger

    catalog_renderer = (
        REPO_ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/operations/documentation/OperationalApiCatalogRenderer.kt"
    ).read_text(encoding="utf-8")
    assert "span>별칭</span>" in catalog_renderer
    assert 'aria-label="별칭:' in catalog_renderer


def test_operational_swagger_maps_device_account_and_receive_flows_without_secrets() -> None:
    swagger = (
        REPO_ROOT / "services/auth-policy/src/main/resources/openapi/gcs-saker-operations-swagger.html"
    ).read_text(encoding="utf-8")

    for label in ("장비 송신", "계정 송신", "관제 수신", "Protocol", "Headers", "Body"):
        assert label in swagger
    for endpoint in (
        "/api/v1/device/publish-sessions",
        "/media-control/api/v1/account/publish-sessions",
        "/media-control/api/v1/streams",
        "/media-control/api/v1/streams/{streamId}/playback",
        "/gcs.saker.v1.SakerGatewayService/Exchange",
        "/webrtc/{server-owned-path}/whip",
        "/webrtc/{server-owned-path}/whep",
    ):
        assert endpoint in swagger
    assert swagger.count("<details>") == swagger.count("</details>") == 9
    assert "민감값" not in swagger
    assert "device-credential" in swagger
    assert "account-credential" in swagger
    assert "@2258703325" not in swagger
    assert "gho_" not in swagger


def test_internal_authentication_and_debug_boundaries_remain_blocked_at_edge() -> None:
    edge = EDGE_CONFIG.read_text(encoding="utf-8")
    document = OPENAPI.read_text(encoding="utf-8")

    assert "location = /auth-policy/policy/devices/authenticate" in edge
    assert "x-gcs-exposure: internal-blocked" in document
    assert "location = /media-control/metrics" in edge
    assert "location /auth-policy/actuator/" in edge


def test_openapi_contains_no_known_secret_material_or_secret_examples() -> None:
    document = OPENAPI.read_text(encoding="utf-8")
    forbidden = ("gho_", "@2258703325", "x-gcs-gateway-token:", "example: gcs_renew_", "example: gcs_boot_")

    for value in forbidden:
        assert value not in document

    assert "writeOnly: true" in document
    assert "Cache-Control" in document
    assert "no-store" in document
