package kr.co.a4ai.gcssaker.authpolicy.domain

data class TelemetryWriteScope(
    val principal: AuthenticatedPrincipal,
    val activeGroup: Boolean,
    val publishAllowed: Boolean,
    val device: RegisteredDevice?,
)

object TelemetryWritePolicy {
    fun authorize(scope: TelemetryWriteScope) {
        if (!scope.activeGroup || !scope.publishAllowed) deny()
        val device = scope.device ?: return
        if (device.groupId != scope.principal.groupId || device.status != RegisteredDeviceStatus.ACTIVE) deny()
    }

    private fun deny(): Nothing = throw PermissionDeniedError(
        TelemetryWriteErrors.WRITE_DENIED, "telemetry write is not permitted",
    )
}

object TelemetryWriteErrors {
    const val WRITE_DENIED = "telemetry_write_denied"
    const val OWNERSHIP_CONFLICT = "telemetry_ownership_conflict"
    const val STORAGE_UNAVAILABLE = "telemetry_store_unavailable"
}

class TelemetryStorageUnavailableError(cause: Throwable) : RuntimeException("telemetry storage is unavailable", cause)
