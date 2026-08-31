package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceNotFoundException
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupAdministrationPolicy
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisterDeviceCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UpdateDeviceCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Validated
@RequestMapping(value = [AdminDeviceApiRoutes.RESOURCE_ROOT, AdminDeviceApiRoutes.ROOT])
class AdminDeviceController(
    private val lifecycle: DeviceLifecycleService,
    private val principalResolver: BearerPrincipalResolver,
) {
    private val administrationPolicy = GroupAdministrationPolicy()

    @GetMapping
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(defaultValue = "200") @Min(1) @Max(500) limit: Int = 200,
        @RequestParam(defaultValue = "0") @Min(0) offset: Int = 0,
    ): List<RegisteredDeviceResponse> {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        val devices = if (principal.role == UserRole.ADMIN) {
            lifecycle.list(limit, offset)
        } else {
            lifecycle.listByGroup(principal.groupId, limit, offset)
        }
        return devices.filter { administrationPolicy.canManageGroup(principal, it.groupId) }.map { it.toAdminResponse() }
    }

    @GetMapping(AdminDeviceApiRoutes.DEVICE)
    @RequiresBearerAuth
    fun get(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): RegisteredDeviceResponse {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        val device = deviceOrNotFound { lifecycle.get(deviceUuid) }
        requireGroupManagement(principal, device.groupId)
        return device.toAdminResponse()
    }

    @PostMapping
    @RequiresBearerAuth
    fun register(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: RegisterDeviceRequest,
    ): DeviceCredentialIssueResponse {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        requireGroupManagement(principal, requestGroupId(request.groupId))
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
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        val current = deviceOrNotFound { lifecycle.get(deviceUuid) }
        requireGroupManagement(principal, current.groupId)
        request.groupId?.let { requireGroupManagement(principal, requestGroupId(it)) }
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
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        requireDeviceManagement(principal, deviceUuid)
        return deviceOrNotFound { lifecycle.activate(deviceUuid) }.toAdminResponse()
    }

    @PostMapping(AdminDeviceApiRoutes.DISABLE)
    @RequiresBearerAuth
    fun disable(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): RegisteredDeviceResponse {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        requireDeviceManagement(principal, deviceUuid)
        return deviceOrNotFound { lifecycle.disable(deviceUuid) }.toAdminResponse()
    }

    @PostMapping(AdminDeviceApiRoutes.ROTATE_CREDENTIAL)
    @RequiresBearerAuth
    fun rotateCredential(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @PathVariable deviceUuid: String,
    ): DeviceCredentialIssueResponse {
        val principal = requireAdministrator(principalResolver.requirePrincipal(authorization))
        requireDeviceManagement(principal, deviceUuid)
        return try {
            lifecycle.rotateCredential(deviceUuid).toAdminResponse()
        } catch (_: DeviceNotFoundException) {
            throw NotFoundApiError(AdminDeviceApiErrors.DEVICE_NOT_FOUND)
        }
    }

    private fun requireAdministrator(principal: AuthenticatedPrincipal): AuthenticatedPrincipal {
        translatePolicyErrors { administrationPolicy.requireGroupManagerRole(principal) }
        return principal
    }

    private fun requireDeviceManagement(principal: AuthenticatedPrincipal, deviceUuid: String) {
        val device = deviceOrNotFound { lifecycle.get(deviceUuid) }
        requireGroupManagement(principal, device.groupId)
    }

    private fun requireGroupManagement(principal: AuthenticatedPrincipal, groupId: GroupId) {
        translatePolicyErrors { administrationPolicy.requireGroupManagement(principal, groupId) }
    }

    private fun requestGroupId(value: String): GroupId =
        try {
            GroupId(value.trim())
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: AdminDeviceApiErrors.INVALID_DEVICE_REQUEST)
        }

    private fun <T> deviceOrNotFound(action: () -> T): T =
        try {
            action()
        } catch (_: DeviceNotFoundException) {
            throw NotFoundApiError(AdminDeviceApiErrors.DEVICE_NOT_FOUND)
        }
}
