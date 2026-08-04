package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationRejectedException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class DeviceAuthenticationRequest(val deviceUuid: String, val credential: String)
data class DeviceAuthenticationResponse(
    val deviceUuid: String,
    val credentialVersion: Long,
    val devicePolicyVersion: Long,
)

@RestController
@RequestMapping(DevicePolicyApiRoutes.ROOT)
class DeviceAuthenticationController(
    private val credentials: DeviceCredentialAuthenticationService,
) {
    @PostMapping(DevicePolicyApiRoutes.AUTHENTICATE)
    fun authenticate(@RequestBody request: DeviceAuthenticationRequest): DeviceAuthenticationResponse {
        val device = try {
            credentials.authenticate(request.deviceUuid, request.credential)
        } catch (error: DevicePublishAuthorizationRejectedException) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, error.message)
        }
        return DeviceAuthenticationResponse(
            deviceUuid = device.deviceUuid,
            credentialVersion = device.credentialVersion,
            devicePolicyVersion = device.policyVersion,
        )
    }
}
