package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalEventQueryValues {
    const val ALL = "all"
}

object OperationalEventQueryFields {
    const val FROM = "from"
    const val TO = "to"
}

object OperationalEventApiFields {
    const val TOTAL_EVENTS = "totalEvents"
    const val TOTAL_CONNECTIONS = "totalConnections"
    const val AVG_LATENCY_MS = "avgLatencyMs"
    const val SEVERITY_COUNTS = "severityCounts"
}

object OperationalEventApiErrors {
    const val INSTANT_QUERY_REQUIRED = "must be ISO-8601 instant"
}
