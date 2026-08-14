package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenContract
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenIssueCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupAdministrationPolicy
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(value = [AdminProvisioningTokenApiRoutes.RESOURCE_ROOT, AdminProvisioningTokenApiRoutes.ROOT])
class AdminProvisioningTokenController(
    private val tokens: DeviceProvisioningTokenService,
    private val principalResolver: BearerPrincipalResolver,
) {
    private val administrationPolicy = GroupAdministrationPolicy()

    @DeleteMapping("/{tokenId}")
    @RequiresBearerAuth
    fun revoke(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable tokenId: String,
    ) {
        val principal = principalResolver.requirePrincipal(authorization)
        requireAdministrator(principal)
        val record = tokens.list().firstOrNull { it.tokenId == tokenId }
            ?: throw NotFoundApiError("provisioning token not found or inactive")
        requireGroupManagement(principal, record.groupId)
        if (!tokens.revoke(tokenId, principal.username)) throw NotFoundApiError("provisioning token not found or inactive")
    }

    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<ProvisioningTokenRecordResponse> {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        return tokens.list()
            .filter { administrationPolicy.canManageGroup(principal, it.groupId) }
            .map { it.toApiResponse() }
    }

    @PostMapping
    @RequiresBearerAuth
    fun issue(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: IssueProvisioningTokenRequest,
    ): ProvisioningTokenIssueResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        requireAdministrator(principal)
        return try {
            requireGroupManagement(principal, GroupId(request.groupId.trim()))
            tokens.issue(
                DeviceProvisioningTokenIssueCommand(
                    groupId = request.groupId,
                    label = request.label,
                    ttlMinutes = request.ttlMinutes ?: DeviceProvisioningTokenContract.DEFAULT_TTL_MINUTES,
                    maxUses = request.maxUses ?: DeviceProvisioningTokenContract.DEFAULT_MAX_USES,
                    createdBy = principal.username,
                ),
            ).toApiResponse()
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: AdminProvisioningTokenApiErrors.INVALID_PROVISIONING_TOKEN_REQUEST)
        }
    }

    private fun requireAdministrator(principal: AuthenticatedPrincipal): AuthenticatedPrincipal {
        translatePolicyErrors { administrationPolicy.requireGroupManagerRole(principal) }
        return principal
    }

    private fun requireGroupManagement(principal: AuthenticatedPrincipal, groupId: GroupId) {
        translatePolicyErrors { administrationPolicy.requireGroupManagement(principal, groupId) }
    }
}
