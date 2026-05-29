package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import com.fasterxml.jackson.annotation.JsonProperty
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamPath
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionDescriptor
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

data class StreamAccessRequest(
    @get:JsonProperty("streamId")
    val streamId: String,
    val path: String,
    @get:JsonProperty("publisherGroupId")
    val publisherGroupId: String,
    val startedAt: Instant? = null,
)

data class StreamAccessResponse(
    @get:JsonProperty("streamId")
    val streamId: String,
    val allowed: Boolean,
    val reason: String,
    val username: String,
    val role: String,
    @get:JsonProperty("groupId")
    val groupId: String,
)

@RestController
@RequestMapping("/policy/streams")
class StreamPolicyController(
    private val sessions: AuthSessionService,
    private val groupPolicy: GroupPolicyService,
) {
    @PostMapping("/access")
    fun access(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
        @RequestBody request: StreamAccessRequest,
    ): StreamAccessResponse {
        val principal = verifyBearerPrincipal(authorization)
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

    private fun verifyBearerPrincipal(authorization: String?) =
        try {
            val token = authorization?.removePrefix("Bearer ")?.takeIf { it != authorization }
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "authentication required")
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token")
        } catch (_: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token")
        }
}
