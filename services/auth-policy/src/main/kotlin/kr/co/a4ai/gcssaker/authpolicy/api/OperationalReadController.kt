package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

data class TelemetryReadResponse(
    val uuid: String,
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val magneticX: Double,
    val magneticY: Double,
    val magneticZ: Double,
    val soc: String,
    val phoneBatterySOC: Double,
    val velocity: Double,
    val totalDistance: Double,
    val epochTime: String,
    val portDistance: Double,
)

data class AssetReadResponse(
    val id: Int,
    val cid: String,
    val uuid: String,
    @get:JsonProperty("company_id")
    val companyId: Int,
    val type: String,
    val name: String,
    val description: String?,
    @get:JsonProperty("image_url")
    val imageUrl: String?,
    val status: String,
    @get:JsonProperty("created_at")
    val createdAt: Instant,
    @get:JsonProperty("updated_at")
    val updatedAt: Instant,
)

@RestController
class OperationalReadController(
    private val repository: OperationalReadRepository,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping("/telemetry/all")
    fun telemetryAll(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
    ): List<TelemetryReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.telemetryFor(principal).map { it.toResponse() }
    }

    @GetMapping("/asset/{gatewayUuid}")
    fun assetsForGateway(
        @PathVariable gatewayUuid: String,
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
    ): List<AssetReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.assetsForGateway(principal, gatewayUuid).map { it.toResponse() }
    }
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
