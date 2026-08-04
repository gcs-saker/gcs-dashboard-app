package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenContract
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenIssueCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(AdminProvisioningTokenApiRoutes.ROOT)
class AdminProvisioningTokenController(
    private val tokens: DeviceProvisioningTokenService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @DeleteMapping("/{tokenId}")
    @RequiresBearerAuth
    fun revoke(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable tokenId: String,
    ) {
        val principal = principalResolver.requirePrincipal(authorization)
        requireAdmin(principal)
        if (!tokens.revoke(tokenId, principal.username)) throw NotFoundApiError("provisioning token not found or inactive")
    }

    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<ProvisioningTokenRecordResponse> {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return tokens.list().map { it.toApiResponse() }
    }

    @PostMapping
    @RequiresBearerAuth
    fun issue(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: IssueProvisioningTokenRequest,
    ): ProvisioningTokenIssueResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        requireAdmin(principal)
        return try {
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

    private fun requireAdmin(principal: AuthenticatedPrincipal) {
        if (principal.role != UserRole.ADMIN) {
            throw ForbiddenApiError(AdminProvisioningTokenApiErrors.ADMIN_ROLE_REQUIRED)
        }
    }
}
