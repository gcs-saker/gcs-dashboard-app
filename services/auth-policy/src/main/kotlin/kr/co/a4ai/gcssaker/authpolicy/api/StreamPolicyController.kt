package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.NoopSecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
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

@RestController
@RequestMapping(StreamPolicyApiRoutes.ROOT)
class StreamPolicyController(
    private val principalResolver: BearerPrincipalResolver,
    private val groupPolicy: GroupPolicyService,
    private val securityAuditPublisher: SecurityAuditPublisher = NoopSecurityAuditPublisher,
) {
    @PostMapping(StreamPolicyApiRoutes.ACCESS)
    @RequiresBearerAuth
    fun access(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: StreamAccessRequest,
    ): StreamAccessResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        val decision = groupPolicy.canViewStream(
            principal,
            StreamSessionDescriptor(
                path = StreamPath(request.path),
                publisherGroupId = GroupId(request.publisherGroupId),
                startedAt = request.startedAt ?: Instant.EPOCH,
            ),
        )
        securityAuditPublisher.publishStreamAccess(
            principal = principal,
            streamId = request.streamId,
            allowed = decision.allowed,
            reason = decision.reason,
        )

        return StreamAccessResponse(
            streamId = request.streamId,
            allowed = decision.allowed,
            reason = decision.reason,
            username = principal.username,
            role = principal.role.name.lowercase(),
            groupId = principal.groupId.value,
            permissions = groupPolicy.permissionsFor(principal.role).map { it.name.lowercase() }.sorted(),
        )
    }
}
