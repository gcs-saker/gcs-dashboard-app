package kr.co.a4ai.gcssaker.authpolicy.api.control

import kr.co.a4ai.gcssaker.authpolicy.api.AuthSecurityHeaders
import kr.co.a4ai.gcssaker.authpolicy.api.BearerPrincipalResolver
import kr.co.a4ai.gcssaker.authpolicy.api.RequiresBearerAuth
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ActiveControlLease
import kr.co.a4ai.gcssaker.authpolicy.domain.ControlLeasePolicy
import kr.co.a4ai.gcssaker.authpolicy.domain.ControlPolicyCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.ControlPolicyDecision
import kr.co.a4ai.gcssaker.authpolicy.domain.ControlPolicyRequest
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/policy/control")
class ControlPolicyController(
    private val principals: BearerPrincipalResolver,
    private val devices: RegisteredDeviceRepository,
    private val hierarchy: OrganizationHierarchyRepository,
) {
    @PostMapping("/access")
    @RequiresBearerAuth
    fun access(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: ControlAccessRequest,
    ): ControlAccessResponse {
        val principal = principals.requirePrincipal(authorization)
        val device = devices.findByDeviceUuid(request.deviceId)
            ?: return ControlAccessResponse(false, "device_not_found", null)
        val groupStatus = hierarchy.listAll().firstOrNull { it.id == principal.groupId }?.status ?: GroupStatus.INACTIVE
        val command = runCatching { ControlPolicyCommand.valueOf(request.command) }.getOrNull()
            ?: return ControlAccessResponse(false, "unsupported_command", device.groupId.value)
        val policyRequest = ControlPolicyRequest(
            principal, device, groupStatus, principal.securityVersion, command,
            request.highRiskConfirmed, Instant.ofEpochMilli(request.nowUnixMillis),
        )
        val decision = when (request.action) {
            "acquire" -> ControlLeasePolicy.authorizeAcquisition(policyRequest, request.lease?.toDomain())
            "command" -> {
                val lease = request.lease?.toDomain()
                    ?: return ControlAccessResponse(false, "lease_required", device.groupId.value)
                ControlLeasePolicy.authorizeCommand(policyRequest, lease, request.controlSessionId.orEmpty())
            }
            else -> return ControlAccessResponse(false, "unsupported_action", device.groupId.value)
        }
        return decision.toResponse(device.groupId.value)
    }
}

data class ControlAccessRequest(
    val action: String,
    val deviceId: String,
    val command: String,
    val highRiskConfirmed: Boolean = false,
    val nowUnixMillis: Long,
    val controlSessionId: String? = null,
    val lease: ControlLeaseRequest? = null,
)

data class ControlLeaseRequest(
    val controlSessionId: String,
    val deviceId: String,
    val username: String,
    val expiresUnixMillis: Long,
) {
    fun toDomain() = ActiveControlLease(controlSessionId, deviceId, username, Instant.ofEpochMilli(expiresUnixMillis))
}

data class ControlAccessResponse(val allowed: Boolean, val reason: String, val groupId: String?)

private fun ControlPolicyDecision.toResponse(groupId: String): ControlAccessResponse = when (this) {
    ControlPolicyDecision.Allowed -> ControlAccessResponse(true, "allowed", groupId)
    is ControlPolicyDecision.Denied -> ControlAccessResponse(false, code.name.lowercase(), groupId)
}
