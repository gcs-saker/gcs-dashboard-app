from fastapi.testclient import TestClient

from api.contracts import AuthProtocol, SecurityHeaderNames, SecurityHeaderValues
from main import app


def test_security_headers_are_attached_to_api_responses() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["permissions-policy"] == "camera=(self), microphone=(self), geolocation=(self)"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "https://services.arcgisonline.com" in response.headers["content-security-policy"]
    assert "worker-src 'self' blob:" in response.headers["content-security-policy"]


def test_cors_only_allows_configured_origins() -> None:
    with TestClient(app) as client:
        allowed_response = client.options(
            "/auth/me",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": f"Authorization, {AuthProtocol.CSRF_HEADER_NAME}",
            },
        )
        denied_response = client.options(
            "/auth/me",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )

    assert allowed_response.status_code == 200
    assert allowed_response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert AuthProtocol.CSRF_HEADER_NAME in allowed_response.headers["access-control-allow-headers"]
    assert "access-control-allow-origin" not in denied_response.headers


def test_direct_python_legacy_routes_are_marked_as_fallback() -> None:
    with TestClient(app) as client:
        response = client.get("/auth/me")

    assert response.headers[SecurityHeaderNames.DEPRECATION.lower()] == "true"
    assert response.headers[SecurityHeaderNames.X_GCS_LEGACY_FALLBACK.lower()] == SecurityHeaderValues.LEGACY_FALLBACK_DIRECT
    assert response.headers[SecurityHeaderNames.X_GCS_REPLACEMENT_ROUTE.lower()] == "/auth-policy/auth"


def test_active_health_route_is_not_marked_as_legacy() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")

    assert SecurityHeaderNames.X_GCS_LEGACY_FALLBACK.lower() not in response.headers
