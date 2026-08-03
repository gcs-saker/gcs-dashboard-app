package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupAccessService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class GroupResponse(val id: String, val name: String, val type: String, val parentId: String?)
data class GroupDeviceResponse(val deviceUuid: String, val groupId: String, val displayName: String, val status: String)
data class GroupDashboardResponse(
    val group: GroupResponse,
    val devices: List<GroupDeviceResponse>,
    val canView: Boolean,
    val canControl: Boolean,
)

@RestController
@RequestMapping("/api/v1/groups")
class GroupQueryController(
    private val groups: GroupAccessService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping
    @RequiresBearerAuth
    fun list(@RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?): List<GroupResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return groups.visibleGroups(principal).map(OrganizationUnit::toResponse)
    }

    @GetMapping("/{groupId}/devices")
    @RequiresBearerAuth
    fun devices(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
        @PathVariable groupId: String,
    ): List<GroupDeviceResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return translateGroupErrors { groups.devicesFor(principal, GroupId(groupId)).map(RegisteredDevice::toGroupResponse) }
    }

    @GetMapping("/{groupId}/dashboard")
    @RequiresBearerAuth
    fun dashboard(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
        @PathVariable groupId: String,
    ): GroupDashboardResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        return translateGroupErrors {
            val id = GroupId(groupId)
            val access = groups.accessFor(principal, id)
            GroupDashboardResponse(
                group = groups.group(principal, id).toResponse(),
                devices = groups.devicesFor(principal, id).map(RegisteredDevice::toGroupResponse),
                canView = access.canView,
                canControl = access.canControl,
            )
        }
    }
}

private fun OrganizationUnit.toResponse() = GroupResponse(id.value, name, type.name.lowercase(), parentId?.value)
private fun RegisteredDevice.toGroupResponse() =
    GroupDeviceResponse(deviceUuid, groupId.value, displayName, status.name.lowercase())

private fun <T> translateGroupErrors(block: () -> T): T = try {
    block()
} catch (error: IllegalArgumentException) {
    throw NotFoundApiError(error.message ?: GroupAccessService.GROUP_NOT_FOUND)
} catch (error: IllegalStateException) {
    throw ForbiddenApiError(error.message ?: GroupAccessService.GROUP_ACCESS_DENIED)
}
