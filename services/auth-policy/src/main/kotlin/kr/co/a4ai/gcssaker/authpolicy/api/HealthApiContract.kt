package kr.co.a4ai.gcssaker.authpolicy.api

object HealthContract {
    const val SERVICE_NAME = "auth-policy"
    const val STATUS_OK = "ok"
    const val STATUS_DEGRADED = "degraded"
    const val CHECK_API = "api"
    const val CHECK_AUTH_REPOSITORY = "auth_repository"
    const val CHECK_JWT_TOKEN_SERVICE = "jwt_token_service"
    const val CHECK_STREAM_POLICY = "stream_policy"
    const val CHECK_JDBC = "jdbc"
    const val CHECK_REDIS = "redis"
    const val REASON_NOT_CONFIGURED = "not_configured"
    const val REASON_CONNECTION_INVALID = "connection_invalid"
    const val REASON_PING_FAILED = "ping_failed"
    const val REASON_UNAVAILABLE = "unavailable"
    const val REDIS_PONG = "PONG"
    const val DEPENDENCY_VALIDATION_TIMEOUT_SECONDS = 1
}
