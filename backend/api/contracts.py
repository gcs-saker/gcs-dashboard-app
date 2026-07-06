from __future__ import annotations

from typing import Final


class AuthRoutes:
    SIGNUP: Final = "/signup"
    LOGIN: Final = "/login"
    REFRESH: Final = "/refresh"
    LOGOUT: Final = "/logout"
    ME: Final = "/me"


class AuthErrorDetails:
    USERNAME_ALREADY_REGISTERED: Final = "Username already registered"
    EMAIL_ALREADY_REGISTERED: Final = "Email already registered"
    INVALID_INVITE_CODE: Final = "Invalid invite code Input"
    INVALID_CREDENTIALS: Final = "Invalid credentials"
    REFRESH_TOKEN_REQUIRED: Final = "refresh token required"
    INVALID_REFRESH_SESSION: Final = "invalid refresh session"
    UNTRUSTED_REQUEST_ORIGIN: Final = "untrusted request origin"
    CSRF_HEADER_REQUIRED: Final = "csrf header required"


class AuthProtocol:
    BEARER_TOKEN_TYPE: Final = "bearer"
    CSRF_HEADER_NAME: Final = "X-GCS-CSRF"
    CSRF_HEADER_VALUE: Final = "same-origin"


class RootRoutes:
    ROOT: Final = "/"
    METRICS: Final = "/metrics"


class RouterPrefixes:
    AUTH: Final = "/auth"
    STREAM_LEGACY: Final = "/stream"
    API_V1: Final = "/api/v1"
    TELEMETRY: Final = "/telemetry"
    CONTROL: Final = "/control"
    ASSET: Final = "/asset"


class HealthRoutes:
    HEALTHZ: Final = "/healthz"
    READYZ: Final = "/readyz"


class SecurityHeaderNames:
    AUTHORIZATION: Final = "Authorization"
    CONTENT_TYPE: Final = "Content-Type"
    ACCEPT: Final = "Accept"
    X_GCS_CSRF: Final = AuthProtocol.CSRF_HEADER_NAME
    X_CONTENT_TYPE_OPTIONS: Final = "X-Content-Type-Options"
    X_FRAME_OPTIONS: Final = "X-Frame-Options"
    REFERRER_POLICY: Final = "Referrer-Policy"
    PERMISSIONS_POLICY: Final = "Permissions-Policy"
    CONTENT_SECURITY_POLICY: Final = "Content-Security-Policy"
    DEPRECATION: Final = "Deprecation"
    X_GCS_LEGACY_FALLBACK: Final = "X-GCS-Legacy-Fallback"
    X_GCS_REPLACEMENT_ROUTE: Final = "X-GCS-Replacement-Route"


class SecurityHeaderValues:
    TRUE: Final = "true"
    NOSNIFF: Final = "nosniff"
    DENY: Final = "DENY"
    NO_REFERRER: Final = "no-referrer"
    SELF_DEVICE_PERMISSIONS: Final = "camera=(self), microphone=(self), geolocation=(self)"
    LEGACY_FALLBACK_DIRECT: Final = "direct-backend-legacy"


class AssetRoutes:
    BY_GATEWAY_UUID: Final = "/{uuid}"


class AssetErrorDetails:
    GATEWAY_NOT_FOUND: Final = "Gateway not found"


class TelemetryRoutes:
    INGEST: Final = "/"
    ALL: Final = "/all"


class StreamRoutes:
    MODULE_PREFIX: Final = "/module"
    STATUS: Final = "/status"
    PATH_FROM_ID: Final = "/paths/from-id/{stream_id}"
    PATH_FROM_PATH: Final = "/paths/from-path/{stream_path:path}"
    STREAMS: Final = "/streams"
    ICE_SERVERS: Final = "/streams/ice-servers"
    PLAYBACK: Final = "/streams/{stream_id}/playback"
    STREAM_STATUS: Final = "/streams/{stream_id}/status"
    STREAM_DETAIL: Final = "/streams/{stream_id}"


class MapRoutes:
    CONFIG: Final = "/map/config"


class LegacyRouteContract:
    MARKED_PREFIXES: Final = (
        RouterPrefixes.AUTH,
        RouterPrefixes.CONTROL,
        RouterPrefixes.STREAM_LEGACY,
        f"{RouterPrefixes.API_V1}/ai",
    )
    MARKED_EXACT_ROUTES: Final = (
        f"{RouterPrefixes.API_V1}{MapRoutes.CONFIG}",
        RootRoutes.METRICS,
    )
    REPLACEMENTS: Final = {
        RouterPrefixes.AUTH: "/auth-policy/auth",
        RouterPrefixes.CONTROL: "disabled-until-control-policy-is-final",
        RouterPrefixes.STREAM_LEGACY: "/media-control/api/v1/streams",
        f"{RouterPrefixes.API_V1}/ai": "edge-ai-sidecar",
        f"{RouterPrefixes.API_V1}{MapRoutes.CONFIG}": "/auth-policy/map/config",
        RootRoutes.METRICS: "service-local-metrics-only",
    }


class StreamErrorDetails:
    STREAM_NOT_REGISTERED: Final = "stream is not registered"


class StreamStatusProtocol:
    FIELD_STREAM: Final = "stream"
    READY: Final = "ready"


class ControlRoutes:
    SEND: Final = "/"


class ControlProtocol:
    TOPIC_PREFIX: Final = "robot/control"
    DEFAULT_ORG_ID: Final = "a4ai"
    DEFAULT_GROUP_ID: Final = "co-a"
    PROTOBUF_PAYLOAD_FORMAT: Final = "protobuf"
    SENT_STATUS: Final = "sent"


class MetricsProtocol:
    ROOT_MESSAGE: Final = "GCS Backend API Running"
