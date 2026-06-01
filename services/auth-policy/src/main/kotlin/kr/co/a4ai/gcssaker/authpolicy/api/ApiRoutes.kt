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
