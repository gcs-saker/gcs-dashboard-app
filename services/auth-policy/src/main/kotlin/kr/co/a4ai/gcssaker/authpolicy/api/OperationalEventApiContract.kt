package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalEventQueryValues {
    const val ALL = "all"
}

object OperationalEventQueryFields {
    const val FROM = "from"
    const val TO = "to"
}

object OperationalEventApiFields {
    const val EVENT_TYPE = "eventType"
    const val SOURCE_SERVICE = "sourceService"
    const val STREAM_ID = "streamId"
    const val CONNECTION_ID = "connectionId"
    const val ICE_PATH = "icePath"
    const val RELAY_FALLBACK_REASON = "relayFallbackReason"
    const val TOTAL_EVENTS = "totalEvents"
    const val TOTAL_CONNECTIONS = "totalConnections"
    const val AVG_LATENCY_MS = "avgLatencyMs"
    const val SEVERITY_COUNTS = "severityCounts"
    const val ICE_PATH_COUNTS = "icePathCounts"
    const val STREAM_SESSIONS = "streamSessions"
}

object OperationalEventApiErrors {
    const val INSTANT_QUERY_REQUIRED = "must be ISO-8601 instant"
}
