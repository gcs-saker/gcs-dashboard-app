package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.Permission
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.security.MessageDigest

object AccountPublisherPolicyApiRoutes {
    const val ROOT = "/policy/accounts"
    const val PUBLISH = "/publish"
}

data class AccountPublishAuthorizationRequest(val sensorId: String = "front")

data class AccountPublishAuthorizationResponse(
    val deviceUuid: String,
    val streamId: String,
    val path: String,
    val sensorId: String,
    val publisherGroupId: String,
    val credentialVersion: Long,
    val devicePolicyVersion: Long,
    val reason: String,
    val policyVersion: String,
)

@RestController
@RequestMapping(AccountPublisherPolicyApiRoutes.ROOT)
class AccountPublisherPolicyController(
    private val principalResolver: BearerPrincipalResolver,
    private val groupPolicy: GroupPolicyService,
) {
    @PostMapping(AccountPublisherPolicyApiRoutes.PUBLISH)
    @RequiresBearerAuth
    fun authorize(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: AccountPublishAuthorizationRequest,
    ): AccountPublishAuthorizationResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        if (Permission.PUBLISH_STREAM !in groupPolicy.permissionsFor(principal.role)) {
            throw ForbiddenApiError("stream publishing permission is required")
        }
        val sensorId = canonicalSegment(request.sensorId, "sensor id")
        val publisherId = "account-${stableAccountId(principal.username)}"
        return AccountPublishAuthorizationResponse(
            deviceUuid = publisherId,
            streamId = "raw.$publisherId.$sensorId",
            path = "raw/$publisherId/$sensorId",
            sensorId = sensorId,
            publisherGroupId = principal.groupId.value,
            credentialVersion = 0,
            devicePolicyVersion = 1,
            reason = "account group authorized",
            policyVersion = "account-publisher-v1",
        )
    }

    private fun canonicalSegment(value: String, label: String): String {
        val normalized = value.trim().lowercase()
        if (!normalized.matches(Regex("[a-z0-9][a-z0-9_-]{0,127}"))) {
            throw BadRequestApiError("$label is invalid")
        }
        return normalized
    }

    private fun stableAccountId(username: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(username.trim().lowercase().toByteArray())
            .take(12)
            .joinToString("") { byte -> "%02x".format(byte) }
}
