package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration
import java.time.Instant

enum class ControlPolicyCommand { MOTION, STOP, CAMERA_PAN_TILT, RETURN_HOME, EMERGENCY_STOP }

enum class ControlDenialCode {
    ROLE_FORBIDDEN, GROUP_INACTIVE, DEVICE_INACTIVE, CROSS_GROUP, STALE_IDENTITY,
    LEASE_CONFLICT, LEASE_MISMATCH, LEASE_EXPIRED, HIGH_RISK_CONFIRMATION_REQUIRED,
}

data class ActiveControlLease(
    val controlSessionId: String,
    val deviceUuid: String,
    val username: String,
    val expiresAt: Instant,
)

data class ControlPolicyRequest(
    val principal: AuthenticatedPrincipal,
    val device: RegisteredDevice,
    val groupStatus: GroupStatus,
    val authoritativeSecurityVersion: Long,
    val command: ControlPolicyCommand,
    val highRiskConfirmed: Boolean,
    val now: Instant,
)

sealed interface ControlPolicyDecision {
    data object Allowed : ControlPolicyDecision
    data class Denied(val code: ControlDenialCode) : ControlPolicyDecision
}

object ControlLeasePolicy {
    val maximumLeaseDuration: Duration = Duration.ofSeconds(30)

    fun authorizeAcquisition(
        request: ControlPolicyRequest,
        currentLease: ActiveControlLease?,
    ): ControlPolicyDecision {
        authorizeBoundary(request)?.let { return it }
        if (currentLease != null && currentLease.expiresAt.isAfter(request.now) &&
            currentLease.username != request.principal.username
        ) {
            return ControlPolicyDecision.Denied(ControlDenialCode.LEASE_CONFLICT)
        }
        return ControlPolicyDecision.Allowed
    }

    fun authorizeCommand(
        request: ControlPolicyRequest,
        lease: ActiveControlLease,
        controlSessionId: String,
    ): ControlPolicyDecision {
        authorizeBoundary(request)?.let { return it }
        if (!lease.expiresAt.isAfter(request.now)) return denied(ControlDenialCode.LEASE_EXPIRED)
        if (lease.controlSessionId != controlSessionId || lease.deviceUuid != request.device.deviceUuid ||
            lease.username != request.principal.username
        ) {
            return denied(ControlDenialCode.LEASE_MISMATCH)
        }
        return ControlPolicyDecision.Allowed
    }

    private fun authorizeBoundary(request: ControlPolicyRequest): ControlPolicyDecision.Denied? {
        if (request.principal.role !in setOf(UserRole.OPERATOR, UserRole.GROUP_ADMIN)) return denied(ControlDenialCode.ROLE_FORBIDDEN)
        if (request.groupStatus != GroupStatus.ACTIVE) return denied(ControlDenialCode.GROUP_INACTIVE)
        if (request.device.status != RegisteredDeviceStatus.ACTIVE) return denied(ControlDenialCode.DEVICE_INACTIVE)
        if (request.principal.groupId != request.device.groupId) return denied(ControlDenialCode.CROSS_GROUP)
        if (request.principal.securityVersion != request.authoritativeSecurityVersion) return denied(ControlDenialCode.STALE_IDENTITY)
        if (request.command == ControlPolicyCommand.RETURN_HOME && !request.highRiskConfirmed) {
            return denied(ControlDenialCode.HIGH_RISK_CONFIRMATION_REQUIRED)
        }
        return null
    }

    private fun denied(code: ControlDenialCode) = ControlPolicyDecision.Denied(code)
}
