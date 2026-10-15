package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.*

class TelemetryWriteAuthorizationService(
    private val policy: GroupPolicyService,
    private val devices: RegisteredDeviceRepository,
) {
    fun authorize(principal: AuthenticatedPrincipal, uuid: String) {
        TelemetryWritePolicy.authorize(TelemetryWriteScope(
            principal, policy.isActiveGroup(principal.groupId),
            Permission.PUBLISH_STREAM in policy.permissionsFor(principal.role), devices.findByDeviceUuid(uuid),
        ))
    }
}
