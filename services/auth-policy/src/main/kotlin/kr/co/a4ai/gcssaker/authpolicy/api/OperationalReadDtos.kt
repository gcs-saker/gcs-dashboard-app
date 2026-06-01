package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty
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

data class TelemetryIngestRequest(
    val uuid: String?,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val altitude: Double? = null,
    val magneticX: Double? = null,
    val magneticY: Double? = null,
    val magneticZ: Double? = null,
    val soc: String? = null,
    val phoneBatterySOC: Double? = null,
    val velocity: Double? = null,
    val totalDistance: Double? = null,
    val epochTime: Long? = null,
    val portDistance: Double? = null,
)

data class AssetReadResponse(
    val id: Int,
    val cid: String,
    val uuid: String,
    @get:JsonProperty(OperationalReadApiFields.COMPANY_ID)
    val companyId: Int,
    val type: String,
    val name: String,
    val description: String?,
    @get:JsonProperty(OperationalReadApiFields.IMAGE_URL)
    val imageUrl: String?,
    val status: String,
    @get:JsonProperty(OperationalReadApiFields.CREATED_AT)
    val createdAt: Instant,
    @get:JsonProperty(OperationalReadApiFields.UPDATED_AT)
    val updatedAt: Instant,
)
