package kr.co.a4ai.gcssaker.authpolicy.domain.control

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kotlin.test.Test
import kotlin.test.assertEquals
import java.time.Instant

class ControlLeasePolicyTest {
    @Test fun `same-group operator acquires an available lease`() =
        assertEquals(ControlPolicyDecision.Allowed, ControlLeasePolicy.authorizeAcquisition(request(), null))

    @Test fun `viewer and system administrator cannot acquire a control lease`() {
        assertDenied(ControlDenialCode.ROLE_FORBIDDEN, request(role = UserRole.VIEWER))
        assertDenied(ControlDenialCode.ROLE_FORBIDDEN, request(role = UserRole.ADMIN))
    }

    @Test fun `sibling inactive and stale identities fail closed`() {
        assertDenied(ControlDenialCode.CROSS_GROUP, request(deviceGroup = "co-b"))
        assertDenied(ControlDenialCode.GROUP_INACTIVE, request(groupStatus = GroupStatus.INACTIVE))
        assertDenied(ControlDenialCode.DEVICE_INACTIVE, request(deviceStatus = RegisteredDeviceStatus.DISABLED))
        assertDenied(ControlDenialCode.STALE_IDENTITY, request(securityVersion = 2))
    }

    @Test fun `an active lease owned by another operator conflicts`() {
        val current = lease(username = "operator-b", expiresAt = NOW.plusSeconds(10))
        assertDenied(ControlDenialCode.LEASE_CONFLICT, request(), current)
        assertEquals(ControlPolicyDecision.Allowed, ControlLeasePolicy.authorizeAcquisition(request(), current.copy(expiresAt = NOW)))
    }

    @Test fun `return home requires explicit high-risk confirmation`() {
        assertDenied(ControlDenialCode.HIGH_RISK_CONFIRMATION_REQUIRED, request(command = ControlPolicyCommand.RETURN_HOME))
        assertEquals(ControlPolicyDecision.Allowed, ControlLeasePolicy.authorizeAcquisition(
            request(command = ControlPolicyCommand.RETURN_HOME, highRiskConfirmed = true), null,
        ))
    }

    @Test fun `command authorization binds principal device session and expiry`() {
        val valid = lease()
        assertEquals(ControlPolicyDecision.Allowed, ControlLeasePolicy.authorizeCommand(request(), valid, SESSION_ID))
        assertCommandDenied(ControlDenialCode.LEASE_MISMATCH, valid, "wrong-session")
        assertCommandDenied(ControlDenialCode.LEASE_EXPIRED, valid.copy(expiresAt = NOW), SESSION_ID)
    }

    private fun assertDenied(code: ControlDenialCode, request: ControlPolicyRequest, lease: ActiveControlLease? = null) {
        assertEquals(ControlPolicyDecision.Denied(code), ControlLeasePolicy.authorizeAcquisition(request, lease))
    }

    private fun assertCommandDenied(code: ControlDenialCode, lease: ActiveControlLease, sessionId: String) {
        assertEquals(ControlPolicyDecision.Denied(code), ControlLeasePolicy.authorizeCommand(request(), lease, sessionId))
    }

    private fun request(
        role: UserRole = UserRole.OPERATOR,
        deviceGroup: String = "co-a",
        groupStatus: GroupStatus = GroupStatus.ACTIVE,
        deviceStatus: RegisteredDeviceStatus = RegisteredDeviceStatus.ACTIVE,
        securityVersion: Long = 1,
        command: ControlPolicyCommand = ControlPolicyCommand.MOTION,
        highRiskConfirmed: Boolean = false,
    ) = ControlPolicyRequest(
        AuthenticatedPrincipal("operator-a", role, GroupId("co-a"), 1),
        device(deviceGroup, deviceStatus), groupStatus, securityVersion, command, highRiskConfirmed, NOW,
    )

    private fun device(group: String, status: RegisteredDeviceStatus) =
        RegisteredDevice("device-1", GroupId(group), "device", "hash", status)

    private fun lease(username: String = "operator-a", expiresAt: Instant = NOW.plusSeconds(30)) =
        ActiveControlLease(SESSION_ID, "device-1", username, expiresAt)

    private companion object {
        const val SESSION_ID = "control-session-1"
        val NOW: Instant = Instant.parse("2026-09-22T06:00:00Z")
    }
}
