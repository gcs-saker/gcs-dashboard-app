package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceNotFoundException
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisterDeviceCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UpdateDeviceCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(AdminDeviceApiRoutes.ROOT)
class AdminDeviceController(
    private val lifecycle: DeviceLifecycleService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<RegisteredDeviceResponse> {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return lifecycle.list().map { it.toAdminResponse() }
    }

    @GetMapping(AdminDeviceApiRoutes.DEVICE)
    @RequiresBearerAuth
    fun get(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): RegisteredDeviceResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return deviceOrNotFound { lifecycle.get(deviceUuid) }.toAdminResponse()
    }

    @PostMapping
    @RequiresBearerAuth
    fun register(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: RegisterDeviceRequest,
    ): DeviceCredentialIssueResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return try {
            lifecycle.register(
                RegisterDeviceCommand(
                    groupId = request.groupId,
                    displayName = request.displayName,
                    deviceType = request.deviceType,
                    sensors = request.sensors.map { it.toDomain() },
                    streamPaths = request.streamPaths.map { it.toDomain() },
                ),
            ).toAdminResponse()
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: AdminDeviceApiErrors.INVALID_DEVICE_REQUEST)
        }
    }

    @PatchMapping(AdminDeviceApiRoutes.DEVICE)
    @RequiresBearerAuth
    fun update(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
        @RequestBody request: UpdateDeviceRequest,
    ): RegisteredDeviceResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return try {
            deviceOrNotFound {
                lifecycle.update(
                    deviceUuid = deviceUuid,
                    command = UpdateDeviceCommand(
                        groupId = request.groupId,
                        displayName = request.displayName,
                        status = request.status,
                        deviceType = request.deviceType,
                        sensors = request.sensors?.map { it.toDomain() },
                        streamPaths = request.streamPaths?.map { it.toDomain() },
                    ),
                )
            }.toAdminResponse()
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: AdminDeviceApiErrors.INVALID_DEVICE_REQUEST)
        }
    }

    @PostMapping(AdminDeviceApiRoutes.ACTIVATE)
    @RequiresBearerAuth
    fun activate(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): RegisteredDeviceResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return deviceOrNotFound { lifecycle.activate(deviceUuid) }.toAdminResponse()
    }

    @PostMapping(AdminDeviceApiRoutes.DISABLE)
    @RequiresBearerAuth
    fun disable(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): RegisteredDeviceResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return deviceOrNotFound { lifecycle.disable(deviceUuid) }.toAdminResponse()
    }

    @PostMapping(AdminDeviceApiRoutes.ROTATE_CREDENTIAL)
    @RequiresBearerAuth
    fun rotateCredential(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): DeviceCredentialIssueResponse {
        requireAdmin(principalResolver.requirePrincipal(authorization))
        return try {
            lifecycle.rotateCredential(deviceUuid).toAdminResponse()
        } catch (_: DeviceNotFoundException) {
            throw NotFoundApiError(AdminDeviceApiErrors.DEVICE_NOT_FOUND)
        }
    }

    private fun requireAdmin(principal: AuthenticatedPrincipal) {
        if (principal.role != UserRole.ADMIN) {
            throw ForbiddenApiError(AdminDeviceApiErrors.ADMIN_ROLE_REQUIRED)
        }
    }

    private fun <T> deviceOrNotFound(action: () -> T): T =
        try {
            action()
        } catch (_: DeviceNotFoundException) {
            throw NotFoundApiError(AdminDeviceApiErrors.DEVICE_NOT_FOUND)
        }
}
