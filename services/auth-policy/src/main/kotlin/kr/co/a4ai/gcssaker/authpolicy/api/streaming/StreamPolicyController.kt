package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.NoopSecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamPath
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionDescriptor
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.time.temporal.ChronoUnit

@RestController
@RequestMapping(StreamPolicyApiRoutes.ROOT)
class StreamPolicyController(
    private val principalResolver: BearerPrincipalResolver,
    private val groupPolicy: GroupPolicyService,
    private val securityAuditPublisher: SecurityAuditPublisher = NoopSecurityAuditPublisher,
    private val decisionTtlSeconds: Long = StreamPolicyDecisionContract.DEFAULT_TTL_SECONDS,
) {
    @PostMapping(StreamPolicyApiRoutes.ACCESS)
    @RequiresBearerAuth
    fun access(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: StreamAccessRequest,
    ): StreamAccessResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        val publisherGroupId = GroupId(request.publisherGroupId)
        val stream = StreamSessionDescriptor(
            path = StreamPath(request.path),
            publisherGroupId = publisherGroupId,
            startedAt = request.startedAt ?: Instant.EPOCH,
        )
        val decision = when (request.action) {
            "view_stream" -> groupPolicy.canViewStream(principal, stream)
            "send_talkback" -> groupPolicy.canSendTalkback(principal, publisherGroupId)
            else -> throw BadRequestApiError("unsupported stream access action")
        }
        if (!decision.allowed || request.action == "send_talkback") {
            securityAuditPublisher.publishStreamAction(
                principal = principal,
                streamId = request.streamId,
                publisherGroupId = publisherGroupId,
                action = request.action,
                allowed = decision.allowed,
                reason = decision.reason,
            )
        }

        return StreamAccessResponse(
            streamId = request.streamId,
            allowed = decision.allowed,
            reason = decision.reason,
            principalId = principal.username,
            username = principal.username,
            role = principal.role.name.lowercase(),
            groupId = principal.groupId.value,
            expiresAt = Instant.now().plus(decisionTtlSeconds, ChronoUnit.SECONDS),
            policyVersion = StreamPolicyDecisionContract.POLICY_VERSION,
            principalVersion = principalVersion(principal),
            permissions = groupPolicy.permissionsFor(principal.role).map { it.name.lowercase() }.sorted(),
        )
    }

    private fun principalVersion(principal: AuthenticatedPrincipal): String =
        "${principal.username}:${principal.groupId.value}:${principal.role.name.lowercase()}"
}

object StreamPolicyDecisionContract {
    const val DEFAULT_TTL_SECONDS = 2L
    const val POLICY_VERSION = "group-policy-v2"
}
