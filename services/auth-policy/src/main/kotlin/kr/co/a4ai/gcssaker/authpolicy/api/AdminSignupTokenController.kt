package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenIssueCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRegistrationTokenService
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
@RequestMapping("/admin/signup-tokens")
class AdminSignupTokenController(
    private val tokens: SignupRegistrationTokenService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @DeleteMapping("/{tokenId}")
    @RequiresBearerAuth
    fun revoke(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable tokenId: String,
    ) {
        val principal = requireAdmin(authorization)
        if (!tokens.revoke(tokenId, principal.username)) throw NotFoundApiError("signup token not found or inactive")
    }

    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<SignupTokenRecordResponse> {
        requireAdmin(authorization)
        return tokens.list().map { it.toResponse() }
    }

    @PostMapping
    @RequiresBearerAuth
    fun issue(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: IssueSignupTokenRequest,
    ): SignupTokenIssueResponse {
        val principal = requireAdmin(authorization)
        return try {
            val issued = tokens.issue(
                SignupRegistrationTokenIssueCommand(
                    companyId = request.companyId,
                    groupId = request.groupId,
                    label = request.label,
                    ttlMinutes = request.ttlMinutes ?: 1_440,
                    maxUses = request.maxUses ?: 1,
                    createdBy = principal.username,
                ),
            )
            SignupTokenIssueResponse(issued.token, issued.record.toResponse())
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: "invalid signup token request")
        }
    }

    private fun requireAdmin(authorization: String?) =
        principalResolver.requirePrincipal(authorization).also {
            if (it.role != UserRole.ADMIN) throw ForbiddenApiError("admin role required")
        }
}

data class IssueSignupTokenRequest(
    val companyId: Int,
    val groupId: String,
    val label: String,
    val ttlMinutes: Long? = null,
    val maxUses: Int? = null,
)

data class SignupTokenIssueResponse(
    val token: String,
    val record: SignupTokenRecordResponse,
)

data class SignupTokenRecordResponse(
    val tokenId: String,
    val companyId: Int,
    val groupId: String,
    val label: String,
    val status: String,
    val maxUses: Int,
    val usedCount: Int,
    val expiresAt: String,
    val createdBy: String,
    val createdAt: String,
)

private fun SignupRegistrationTokenRecord.toResponse() = SignupTokenRecordResponse(
    tokenId = tokenId,
    companyId = companyId,
    groupId = groupId.value,
    label = label,
    status = status.name.lowercase(),
    maxUses = maxUses,
    usedCount = usedCount,
    expiresAt = expiresAt.toString(),
    createdBy = createdBy,
    createdAt = createdAt.toString(),
)
