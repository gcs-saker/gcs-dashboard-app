package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalReadApiErrors {
    const val UUID_REQUIRED = "uuid is required"
    const val DEVICE_ID_MISMATCH = "deviceId does not match telemetry uuid"
    const val OBSERVED_TIMESTAMP_REQUIRED = "observedUnixMillis is required"
    const val OBSERVED_TIMESTAMP_INVALID = "observedUnixMillis must be a positive Unix timestamp"
    const val OBSERVED_TIMESTAMP_IN_FUTURE = "observedUnixMillis is too far in the future"
    const val SERVICE_NAME_REQUIRED = "serviceName is required"
    const val STATUS_REQUIRED = "status is required"
    const val STREAM_ID_REQUIRED = "streamId is required"
}

object TelemetryIngestPolicy {
    const val MAX_FUTURE_SKEW_MILLIS = 300_000L
}

object OperationalReadQueryPolicy {
    const val DEFAULT_LIMIT = 100
    const val MIN_LIMIT = 1
    const val MAX_LIMIT = 500

    fun normalizeLimit(value: Int?): Int = value?.coerceIn(MIN_LIMIT, MAX_LIMIT) ?: DEFAULT_LIMIT
}

object OperationalReadStatusContract {
    const val NEW_CONNECTION = "new"
    const val CLOSED_CONNECTION = "closed"
    const val UNSUPPORTED_CONNECTION = "unsupported"
    const val STREAM_SESSION_SOURCE_MEDIA_CONTROL = "media-control"
}
