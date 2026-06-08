package kr.co.a4ai.gcssaker.authpolicy.api

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
) {
    @PostMapping(StreamPolicyApiRoutes.ACCESS)
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

        return StreamAccessResponse(
            streamId = request.streamId,
            allowed = decision.allowed,
            reason = decision.reason,
            username = principal.username,
            role = principal.role.name.lowercase(),
            groupId = principal.groupId.value,
        )
    }
}
