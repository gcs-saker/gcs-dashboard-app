package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapContract
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapRejectedException
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapService
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(DeviceBootstrapApiRoutes.ROOT)
class DeviceBootstrapController(
    private val bootstrap: DeviceBootstrapService,
) {
    @PostMapping(DeviceBootstrapApiRoutes.REGISTER)
    fun register(
        @RequestBody request: DeviceBootstrapRequest,
    ): DeviceBootstrapResponse =
        try {
            bootstrap.bootstrap(
                DeviceBootstrapCommand(
                    provisioningToken = request.provisioningToken,
                    displayName = request.displayName,
                    deviceType = request.deviceType,
                    sensors = request.sensors.map { it.toDomain() },
                    streamPaths = request.streamPaths.map { it.toDomain() },
                ),
            ).toBootstrapResponse()
        } catch (error: DeviceBootstrapRejectedException) {
            throw ForbiddenApiError(error.message ?: DeviceBootstrapContract.INVALID_PROVISIONING_TOKEN)
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: DeviceBootstrapApiErrors.INVALID_BOOTSTRAP_REQUEST)
        }
}
