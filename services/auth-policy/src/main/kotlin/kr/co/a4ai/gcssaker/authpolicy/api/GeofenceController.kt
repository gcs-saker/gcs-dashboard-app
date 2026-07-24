package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.GeoPoint
import kr.co.a4ai.gcssaker.authpolicy.domain.Geofence
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

object GeofenceApiRoutes {
    const val ROOT = "/api/v1/geofences"
    const val BY_ID = "$ROOT/{geofenceId}"
}

data class GeoPointRequest(val latitude: Double, val longitude: Double)
data class GeofenceCreateRequest(
    val name: String,
    val polygon: List<GeoPointRequest>,
    val enabled: Boolean = true,
)
data class GeofenceResponse(
    val id: String,
    val name: String,
    val polygon: List<GeoPointRequest>,
    val enabled: Boolean,
    val groupId: String,
)

@RestController
class GeofenceController(
    private val repository: GeofenceRepository,
    principalResolver: BearerPrincipalResolver,
) {
    private val requestReader = OperationalReadRequestReader(principalResolver)

    @PostMapping(GeofenceApiRoutes.ROOT)
    @ResponseStatus(HttpStatus.CREATED)
    @RequiresBearerAuth
    fun create(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: GeofenceCreateRequest,
    ): GeofenceResponse {
        val principal = requestReader.principal(authorization)
        val geofence = try {
            Geofence(
                id = UUID.randomUUID().toString(),
                name = request.name.trim(),
                groupId = principal.groupId,
                polygon = request.polygon.map { GeoPoint(it.latitude, it.longitude) },
                enabled = request.enabled,
            )
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: "invalid geofence")
        }
        return repository.save(geofence).toResponse()
    }

    @GetMapping(GeofenceApiRoutes.ROOT)
    @RequiresBearerAuth
    fun list(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<GeofenceResponse> = repository.findVisible(requestReader.principal(authorization)).map { it.toResponse() }

    @DeleteMapping(GeofenceApiRoutes.BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequiresBearerAuth
    fun delete(
        @PathVariable geofenceId: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ) {
        if (!repository.delete(geofenceId, requestReader.principal(authorization))) {
            throw NotFoundApiError("geofence not found")
        }
    }
}

private fun Geofence.toResponse(): GeofenceResponse =
    GeofenceResponse(id, name, polygon.map { GeoPointRequest(it.latitude, it.longitude) }, enabled, groupId.value)
