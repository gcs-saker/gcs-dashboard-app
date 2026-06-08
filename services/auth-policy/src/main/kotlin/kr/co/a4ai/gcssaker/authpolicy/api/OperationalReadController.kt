package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class OperationalReadController(
    private val repository: OperationalReadRepository,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping(OperationalReadApiRoutes.TELEMETRY_ALL)
    fun telemetryAll(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<TelemetryReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.telemetryFor(principal).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.TELEMETRY_INGEST)
    fun ingestTelemetry(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.upsertTelemetry(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.ASSET_BY_GATEWAY)
    fun assetsForGateway(
        @PathVariable gatewayUuid: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<AssetReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.assetsForGateway(principal, gatewayUuid).map { it.toResponse() }
    }
}

private fun TelemetryIngestRequest.toReadModel(principal: AuthenticatedPrincipal): TelemetryReadModel {
    val telemetryUuid = uuid?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.UUID_REQUIRED)
    return TelemetryReadModel(
        uuid = telemetryUuid,
        latitude = latitude ?: 0.0,
        longitude = longitude ?: 0.0,
        altitude = altitude ?: 0.0,
        magneticX = magneticX ?: 0.0,
        magneticY = magneticY ?: 0.0,
        magneticZ = magneticZ ?: 0.0,
        soc = soc ?: "0",
        phoneBatterySOC = phoneBatterySOC ?: 0.0,
        velocity = velocity ?: 0.0,
        totalDistance = totalDistance ?: 0.0,
        epochTime = formatEpochTime(epochTime),
        portDistance = portDistance ?: 0.0,
        groupId = GroupId(principal.groupId.value),
    )
}

private fun formatEpochTime(epochTime: Long?): String {
    val seconds = epochTime ?: 0L
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val remainingSeconds = seconds % 60
    return "%02d:%02d:%02d".format(hours, minutes, remainingSeconds)
}

private fun TelemetryReadModel.toResponse(): TelemetryReadResponse =
    TelemetryReadResponse(
        uuid = uuid,
        latitude = latitude,
        longitude = longitude,
        altitude = altitude,
        magneticX = magneticX,
        magneticY = magneticY,
        magneticZ = magneticZ,
        soc = soc,
        phoneBatterySOC = phoneBatterySOC,
        velocity = velocity,
        totalDistance = totalDistance,
        epochTime = epochTime,
        portDistance = portDistance,
    )

private fun AssetReadModel.toResponse(): AssetReadResponse =
    AssetReadResponse(
        id = id,
        cid = cid,
        uuid = uuid,
        companyId = companyId,
        type = type,
        name = name,
        description = description,
        imageUrl = imageUrl,
        status = status,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
