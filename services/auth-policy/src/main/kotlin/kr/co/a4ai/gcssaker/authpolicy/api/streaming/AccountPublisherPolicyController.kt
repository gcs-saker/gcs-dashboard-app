package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.Permission
import kr.co.a4ai.gcssaker.authpolicy.domain.AccountPublishAuthorizationService
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
        if (!groupPolicy.isActiveGroup(principal.groupId)) {
            throw ForbiddenApiError("publisher group is inactive")
        }
        if (Permission.PUBLISH_STREAM !in groupPolicy.permissionsFor(principal.role)) {
            throw ForbiddenApiError("stream publishing permission is required")
        }
        val result = AccountPublishAuthorizationService(groupPolicy).authorize(principal, request.sensorId)
        return AccountPublishAuthorizationResponse(
            deviceUuid = result.deviceUuid,
            streamId = result.streamId,
            path = result.path,
            sensorId = result.sensorId,
            publisherGroupId = principal.groupId.value,
            credentialVersion = 0,
            devicePolicyVersion = 1,
            reason = "account group authorized",
            policyVersion = "account-publisher-v1",
        )
    }

}
