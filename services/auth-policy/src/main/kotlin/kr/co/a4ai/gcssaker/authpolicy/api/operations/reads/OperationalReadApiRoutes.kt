package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalReadApiRoutes {
    const val TELEMETRY_ALL = "/telemetry/all"
    const val TELEMETRY_INGEST = "/telemetry/"
    const val DEVICE_TELEMETRY_INGEST = "/api/v1/devices/{deviceId}/telemetry"
    const val TELEMETRY_HISTORY = "/telemetry/{uuid}/history"
    const val ASSET_BY_GATEWAY = "/asset/{gatewayUuid}"
    const val SERVER_HEALTH_SNAPSHOTS = "/ops/server-health/snapshots"
    const val STREAM_SESSIONS = "/ops/stream-sessions"
    const val STREAM_SESSIONS_STREAM = "/ops/stream-sessions/stream"
}
