package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import kr.co.a4ai.gcssaker.authpolicy.application.NoopSecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.CreateGroupCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.PolicyContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.UpdateGroupCommand
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/admin/groups")
class GroupLifecycleController(
    private val lifecycle: GroupLifecycleService,
    private val principalResolver: BearerPrincipalResolver,
    private val audit: SecurityAuditPublisher = NoopSecurityAuditPublisher,
    private val clientIpResolver: ClientIpResolver = ClientIpResolver(),
) {
    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<ManagedGroupResponse> = translateGroupLifecycleErrors {
        lifecycle.list(principalResolver.requirePrincipal(authorization)).map(OrganizationUnit::toManagedResponse)
    }

    @PostMapping
    @RequiresBearerAuth
    fun create(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: CreateManagedGroupRequest,
        servletRequest: HttpServletRequest,
    ): ManagedGroupResponse = translateGroupLifecycleErrors {
        val principal = principalResolver.requirePrincipal(authorization)
        val groupId = GroupId(request.id.trim())
        lifecycle.create(
            principal,
            CreateGroupCommand(groupId, request.name, GroupType.valueOf(request.type.uppercase()), request.parentId?.let(::GroupId)),
        ).also { audit.publishGroupManagement(principal, groupId, "group.create", groupId.value, clientIpResolver.resolve(servletRequest)) }
            .toManagedResponse()
    }

    @PatchMapping("/{groupId}")
    @RequiresBearerAuth
    fun update(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
        @RequestBody request: UpdateManagedGroupRequest,
        servletRequest: HttpServletRequest,
    ): ManagedGroupResponse = translateGroupLifecycleErrors {
        val principal = principalResolver.requirePrincipal(authorization)
        val id = GroupId(groupId)
        lifecycle.update(principal, id, UpdateGroupCommand(request.name, request.parentId?.let(::GroupId), request.changeParent))
            .also { audit.publishGroupManagement(principal, id, "group.update", id.value, clientIpResolver.resolve(servletRequest)) }
            .toManagedResponse()
    }

    @PostMapping("/{groupId}/activate")
    @RequiresBearerAuth
    fun activate(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
        servletRequest: HttpServletRequest,
    ): ManagedGroupResponse = changeStatus(authorization, groupId, servletRequest, true)

    @PostMapping("/{groupId}/deactivate")
    @RequiresBearerAuth
    fun deactivate(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
        servletRequest: HttpServletRequest,
    ): ManagedGroupResponse = changeStatus(authorization, groupId, servletRequest, false)

    private fun changeStatus(authorization: String?, groupId: String, request: HttpServletRequest, active: Boolean) =
        translateGroupLifecycleErrors {
            val principal = principalResolver.requirePrincipal(authorization)
            val id = GroupId(groupId)
            val result = if (active) lifecycle.activate(principal, id) else lifecycle.deactivate(principal, id)
            audit.publishGroupManagement(principal, id, "group.${if (active) "activate" else "deactivate"}", id.value, clientIpResolver.resolve(request))
            result.toManagedResponse()
        }
}

data class CreateManagedGroupRequest(val id: String, val name: String, val type: String, val parentId: String? = null)
data class UpdateManagedGroupRequest(val name: String? = null, val parentId: String? = null, val changeParent: Boolean = false)
data class ManagedGroupResponse(val id: String, val name: String, val type: String, val parentId: String?, val status: String)

private fun OrganizationUnit.toManagedResponse() = ManagedGroupResponse(id.value, name, type.name.lowercase(), parentId?.value, status.name.lowercase())

private fun <T> translateGroupLifecycleErrors(action: () -> T): T = try {
    action()
} catch (error: PolicyContractError) {
    throw error.toApiError()
} catch (error: IllegalStateException) {
    if (error.message == "group not found") throw NotFoundApiError("group not found")
    throw ConflictApiError(error.message ?: "group lifecycle conflict")
} catch (error: IllegalArgumentException) {
    val message = error.message ?: "invalid group lifecycle request"
    if (message.contains("administrator required")) throw ForbiddenApiError(message)
    throw ConflictApiError(message)
}
