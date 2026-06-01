package kr.co.a4ai.gcssaker.authpolicy.api

object AuthApiRoutes {
    const val ROOT = "/auth"
    const val SIGNUP = "/signup"
    const val LOGIN = "/login"
    const val REFRESH = "/refresh"
    const val ME = "/me"
    const val LOGOUT = "/logout"
}

object HealthApiRoutes {
    const val HEALTHZ = "/healthz"
    const val READYZ = "/readyz"
}

object StreamPolicyApiRoutes {
    const val ROOT = "/policy/streams"
    const val ACCESS = "/access"
}

object OpsApiRoutes {
    const val EVENTS = "/ops/events"
    const val TIME_STATUS = "/ops/time/status"
    const val TIME_CHECK = "/ops/time/check"
    const val TIME_CONFIG = "/ops/time/config"
}

object OperationalReadApiRoutes {
    const val TELEMETRY_ALL = "/telemetry/all"
    const val TELEMETRY_INGEST = "/telemetry/"
    const val ASSET_BY_GATEWAY = "/asset/{gatewayUuid}"
}

object AuthSecurityHeaders {
    const val CSRF_HEADER_NAME = "X-GCS-CSRF"
    const val CSRF_HEADER_VALUE = "same-origin"
}

object AuthTokenContract {
    const val BEARER_PREFIX = "Bearer "
    const val BEARER_TOKEN_TYPE = "bearer"
}

object AuthErrorMessages {
    const val INVALID_CREDENTIALS = "Invalid credentials"
    const val REFRESH_TOKEN_REQUIRED = "refresh token required"
    const val INVALID_TOKEN = "invalid token"
    const val AUTHENTICATION_REQUIRED = "authentication required"
    const val UNTRUSTED_REQUEST_ORIGIN = "untrusted request origin"
    const val CSRF_HEADER_REQUIRED = "csrf header required"
    const val SIGNUP_REJECTED = "signup rejected"
    const val INVALID_SIGNUP_REQUEST = "invalid signup request"
    const val OPERATOR_ROLE_REQUIRED = "operator role required"
    const val INVALID_TIME_SYNC_CONFIG = "invalid time sync config"
    const val UUID_REQUIRED = "uuid is required"
}

object AuthResponseFields {
    const val ACCESS_TOKEN = "access_token"
    const val TOKEN_TYPE = "token_type"
    const val EXPIRES_IN_MINUTES = "expires_in_minutes"
    const val COMPANY_ID = "company_id"
    const val IMAGE_URL = "image_url"
    const val CREATED_AT = "created_at"
    const val UPDATED_AT = "updated_at"
    const val STREAM_ID = "streamId"
    const val PUBLISHER_GROUP_ID = "publisherGroupId"
    const val GROUP_ID = "groupId"
}

object HealthContract {
    const val SERVICE_NAME = "auth-policy"
    const val STATUS_OK = "ok"
    const val CHECK_API = "api"
    const val CHECK_AUTH_REPOSITORY = "auth_repository"
    const val CHECK_JWT_TOKEN_SERVICE = "jwt_token_service"
    const val CHECK_STREAM_POLICY = "stream_policy"
}

object OperationalQueryValues {
    const val ALL = "all"
}
