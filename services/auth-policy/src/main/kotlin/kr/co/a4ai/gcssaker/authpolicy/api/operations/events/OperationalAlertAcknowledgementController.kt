package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupAdministrationPolicy
import kr.co.a4ai.gcssaker.authpolicy.domain.PolicyContractError
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgement
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgementRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
class OperationalAlertAcknowledgementController(
    private val principals: BearerPrincipalResolver,
    private val audit: SecurityAuditPublisher,
    private val acknowledgements: OperationalAlertAcknowledgementRepository,
    private val clientIpResolver: ClientIpResolver = ClientIpResolver(),
    private val policy: GroupAdministrationPolicy = GroupAdministrationPolicy(),
) {
    @PostMapping("/api/v1/operations/alerts/acknowledgements")
    @RequiresBearerAuth
    fun acknowledge(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: OperationalAlertAcknowledgementRequest,
        servletRequest: HttpServletRequest,
    ): OperationalAlertAcknowledgementResponse = translateErrors {
        val principal = principals.requirePrincipal(authorization)
        policy.requireSystemAdministrator(principal)
        require(request.runbookId in RUNBOOK_IDS) { "unsupported runbook id" }
        val state = request.state.trim().lowercase()
        require(state in STATES) { "unsupported acknowledgement state" }
        val saved = acknowledgements.save(OperationalAlertAcknowledgement(
            runbookId = request.runbookId, state = state, updatedBy = principal.username, updatedAt = Instant.now(),
        ))
        audit.publishGroupManagement(
            principal, principal.groupId, "operational.alert.$state", request.runbookId,
            clientIpResolver.resolve(servletRequest),
        )
        saved.toResponse()
    }

    @GetMapping("/api/v1/operations/alerts/acknowledgements")
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<OperationalAlertAcknowledgementResponse> = translateErrors {
        policy.requireSystemAdministrator(principals.requirePrincipal(authorization))
        acknowledgements.list().map(OperationalAlertAcknowledgement::toResponse)
    }

    private fun <T> translateErrors(action: () -> T): T = try {
        action()
    } catch (error: PolicyContractError) {
        throw error.toApiError()
    } catch (error: IllegalArgumentException) {
        throw BadRequestApiError(error.message ?: "invalid acknowledgement")
    }

    private companion object {
        val RUNBOOK_IDS = setOf("RUN-PUB-01", "RUN-PUB-02", "RUN-PUB-03")
        val STATES = setOf("acknowledged", "in_progress", "resolved")
    }
}

data class OperationalAlertAcknowledgementRequest(val runbookId: String, val state: String)
data class OperationalAlertAcknowledgementResponse(
    val runbookId: String,
    val state: String,
    val updatedBy: String,
    val updatedAt: Instant,
)

private fun OperationalAlertAcknowledgement.toResponse() = OperationalAlertAcknowledgementResponse(
    runbookId, state, updatedBy, updatedAt,
)
