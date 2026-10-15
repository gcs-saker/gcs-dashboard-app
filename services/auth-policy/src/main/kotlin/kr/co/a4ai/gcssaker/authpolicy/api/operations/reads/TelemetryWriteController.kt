package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationRejectedException
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryWriteAuthorizationService
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class TelemetryWriteController(
    private val principalResolver: BearerPrincipalResolver,
    private val authorization: TelemetryWriteAuthorizationService,
    private val ingestion: TelemetryIngestionService,
    private val deviceCredentials: DeviceCredentialAuthenticationService,
) {
    @PostMapping(OperationalReadApiRoutes.TELEMETRY_INGEST)
    @RequiresBearerAuth
    fun ingestTelemetry(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) bearer: String?,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse = translatePolicyErrors {
        val principal = principalResolver.requirePrincipal(bearer)
        val sample = request.toReadModel(principal)
        authorization.authorize(principal, sample.uuid)
        ingestion.ingest(sample).toResponse()
    }

    @PostMapping(OperationalReadApiRoutes.DEVICE_TELEMETRY_INGEST)
    @RequiresBearerAuth
    fun ingestDeviceTelemetry(
        @PathVariable deviceId: String,
        @RequestHeader headers: HttpHeaders,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse = translatePolicyErrors {
        val identity = validateTelemetryUuid(deviceId)
        val group = deviceGroup(identity, headers)
        ingestion.ingest(request.toDeviceReadModel(group, identity, ingestion.currentTime())).toResponse()
    }

    private fun deviceGroup(deviceId: String, headers: HttpHeaders): GroupId {
        val uuid = headers.getFirst(DeviceTelemetryAuthHeaders.DEVICE_UUID)
        val credential = headers.getFirst(DeviceTelemetryAuthHeaders.DEVICE_CREDENTIAL)
        if (uuid.isNullOrBlank() && credential.isNullOrBlank()) {
            val principal = principalResolver.requirePrincipal(headers.getFirst(HttpHeaders.AUTHORIZATION))
            authorization.authorize(principal, deviceId)
            return principal.groupId
        }
        if (uuid != deviceId) throw ForbiddenApiError(OperationalReadApiErrors.DEVICE_ID_MISMATCH)
        return try {
            deviceCredentials.authenticate(uuid, credential.orEmpty()).groupId
        } catch (_: DevicePublishAuthorizationRejectedException) {
            throw ForbiddenApiError("device authentication failed")
        }
    }
}
