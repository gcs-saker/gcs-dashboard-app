package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupMemberAdministrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupMemberUpdate
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/admin/groups/{groupId}")
class GroupMemberAdministrationController(
    private val members: GroupMemberAdministrationService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping("/members")
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
    ): List<GroupMemberResponse> = translateMemberErrors {
        members.list(principalResolver.requirePrincipal(authorization), GroupId(groupId)).map(AuthUser::toMemberResponse)
    }

    @PatchMapping("/members/{username}")
    @RequiresBearerAuth
    fun update(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
        @PathVariable username: String,
        @RequestBody request: UpdateGroupMemberRequest,
    ): GroupMemberResponse = translateMemberErrors {
        members.update(
            principal = principalResolver.requirePrincipal(authorization),
            groupId = GroupId(groupId),
            username = username,
            command = GroupMemberUpdate(
                role = request.role?.let { UserRole.valueOf(it.trim().uppercase()) },
                active = request.active,
                password = request.password,
            ),
        ).toMemberResponse()
    }

    @PutMapping("/administrator")
    @RequiresBearerAuth
    fun replaceAdministrator(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable groupId: String,
        @RequestBody request: ReplaceGroupAdministratorRequest,
    ): GroupMemberResponse = translateMemberErrors {
        members.replaceGroupAdmin(
            principalResolver.requirePrincipal(authorization),
            GroupId(groupId),
            request.username,
        ).toMemberResponse()
    }
}

data class UpdateGroupMemberRequest(
    val role: String? = null,
    val active: Boolean? = null,
    val password: String? = null,
)

data class ReplaceGroupAdministratorRequest(val username: String)

data class GroupMemberResponse(
    val username: String,
    val email: String,
    val role: String,
    val groupId: String,
    val active: Boolean,
    val securityVersion: Long,
)

private fun AuthUser.toMemberResponse() = GroupMemberResponse(
    username = username,
    email = email,
    role = role.name.lowercase(),
    groupId = groupId.value,
    active = active,
    securityVersion = securityVersion,
)

private fun <T> translateMemberErrors(action: () -> T): T = try {
    action()
} catch (error: IllegalStateException) {
    if (error.message == "User not found") throw NotFoundApiError("user not found")
    throw ConflictApiError(error.message ?: "member operation failed")
} catch (error: IllegalArgumentException) {
    val message = error.message ?: "invalid member operation"
    if (message.contains("denied") || message.contains("required")) throw ForbiddenApiError(message)
    throw BadRequestApiError(message)
}
