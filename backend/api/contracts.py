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


class AuthProtocol:
    BEARER_TOKEN_TYPE: Final = "bearer"


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
    X_CONTENT_TYPE_OPTIONS: Final = "X-Content-Type-Options"
    X_FRAME_OPTIONS: Final = "X-Frame-Options"
    REFERRER_POLICY: Final = "Referrer-Policy"
    PERMISSIONS_POLICY: Final = "Permissions-Policy"
    CONTENT_SECURITY_POLICY: Final = "Content-Security-Policy"


class SecurityHeaderValues:
    NOSNIFF: Final = "nosniff"
    DENY: Final = "DENY"
    NO_REFERRER: Final = "no-referrer"
    SELF_DEVICE_PERMISSIONS: Final = "camera=(self), microphone=(self), geolocation=(self)"


class AssetRoutes:
    BY_GATEWAY_UUID: Final = "/{uuid}"


class AssetErrorDetails:
    GATEWAY_NOT_FOUND: Final = "Gateway not found"


class TelemetryRoutes:
    INGEST: Final = "/"
    ALL: Final = "/all"


class StreamRoutes:
    STATUS: Final = "/status"
    PATH_FROM_ID: Final = "/paths/from-id/{stream_id}"
    PATH_FROM_PATH: Final = "/paths/from-path/{stream_path:path}"
    STREAMS: Final = "/streams"
    ICE_SERVERS: Final = "/streams/ice-servers"
    PLAYBACK: Final = "/streams/{stream_id}/playback"
    STREAM_STATUS: Final = "/streams/{stream_id}/status"
    STREAM_DETAIL: Final = "/streams/{stream_id}"


class StreamErrorDetails:
    STREAM_NOT_REGISTERED: Final = "stream is not registered"


class ControlRoutes:
    SEND: Final = "/"


class ControlProtocol:
    TOPIC_PREFIX: Final = "robot/control"
    SENT_STATUS: Final = "sent"


class MetricsProtocol:
    ROOT_MESSAGE: Final = "GCS Backend API Running"
