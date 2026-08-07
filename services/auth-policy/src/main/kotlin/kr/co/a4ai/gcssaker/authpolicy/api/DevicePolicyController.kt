package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationRejectedException
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping(DevicePolicyApiRoutes.ROOT)
class DevicePolicyController(
    private val deviceAuthorization: DevicePublishAuthorizationService,
) {
    @PostMapping(DevicePolicyApiRoutes.PUBLISH)
    fun publishAuthorization(
        @RequestBody request: DevicePublishAuthorizationRequest,
    ): DevicePublishAuthorizationResponse {
        val authorization = try {
            deviceAuthorization.authorize(
                DevicePublishAuthorizationCommand(
                    deviceUuid = request.deviceUuid,
                    credential = request.credential,
                    sensorId = request.sensorId,
                ),
            )
        } catch (error: DevicePublishAuthorizationRejectedException) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, error.message)
        } catch (error: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, error.message)
        }

        return DevicePublishAuthorizationResponse(
            deviceUuid = authorization.deviceUuid,
            streamId = authorization.streamId,
            path = authorization.path,
            sensorId = authorization.sensorId,
            publisherGroupId = authorization.publisherGroupId.value,
            credentialVersion = authorization.credentialVersion,
            devicePolicyVersion = authorization.devicePolicyVersion,
            reason = authorization.reason,
            policyVersion = DevicePolicyDecisionContract.POLICY_VERSION,
        )
    }
}

object DevicePolicyDecisionContract {
    const val POLICY_VERSION = "device-policy-v1"
}
