package kr.co.a4ai.gcssaker.authpolicy.domain

enum class TelemetryReadScope {
    OWN_GROUP,
    POLICY_FILTERED,
    ;

    companion object {
        // Operational telemetry scope only; this never grants media access to a system administrator.
        fun forRole(role: UserRole): TelemetryReadScope = when (role) {
            UserRole.VIEWER, UserRole.OPERATOR -> OWN_GROUP
            UserRole.GROUP_ADMIN, UserRole.ADMIN -> POLICY_FILTERED
        }
    }
}
