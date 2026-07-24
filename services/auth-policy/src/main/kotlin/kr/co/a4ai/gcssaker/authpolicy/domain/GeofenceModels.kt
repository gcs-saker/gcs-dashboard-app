package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class GeoPoint(val latitude: Double, val longitude: Double) {
    init {
        require(latitude in -90.0..90.0) { "latitude must be between -90 and 90" }
        require(longitude in -180.0..180.0) { "longitude must be between -180 and 180" }
    }
}

data class Geofence(
    val id: String,
    val name: String,
    val groupId: GroupId,
    val polygon: List<GeoPoint>,
    val enabled: Boolean = true,
) {
    init {
        require(id.isNotBlank()) { "geofence id must not be blank" }
        require(name.isNotBlank()) { "geofence name must not be blank" }
        require(polygon.size >= 3) { "geofence polygon requires at least three points" }
    }

    fun contains(point: GeoPoint): Boolean {
        var inside = false
        var previous = polygon.last()
        for (current in polygon) {
            if (point.onSegment(previous, current)) return true
            val crosses = (current.latitude > point.latitude) != (previous.latitude > point.latitude)
            if (crosses) {
                val intersectionLongitude =
                    (previous.longitude - current.longitude) *
                        (point.latitude - current.latitude) /
                        (previous.latitude - current.latitude) +
                        current.longitude
                if (point.longitude < intersectionLongitude) inside = !inside
            }
            previous = current
        }
        return inside
    }
}

interface GeofenceRepository {
    fun save(geofence: Geofence): Geofence
    fun findVisible(principal: AuthenticatedPrincipal): List<Geofence>
    fun findEnabled(groupId: GroupId): List<Geofence>
    fun delete(id: String, principal: AuthenticatedPrincipal): Boolean
}

class InMemoryGeofenceRepository : GeofenceRepository {
    private val geofences = ConcurrentHashMap<String, Geofence>()

    override fun save(geofence: Geofence): Geofence = geofence.also { geofences[it.id] = it }

    override fun findVisible(principal: AuthenticatedPrincipal): List<Geofence> =
        geofences.values.filter { principal.role == UserRole.ADMIN || it.groupId == principal.groupId }.sortedBy { it.name }

    override fun findEnabled(groupId: GroupId): List<Geofence> =
        geofences.values.filter { it.enabled && it.groupId == groupId }

    override fun delete(id: String, principal: AuthenticatedPrincipal): Boolean {
        val existing = geofences[id] ?: return false
        if (principal.role != UserRole.ADMIN && existing.groupId != principal.groupId) return false
        return geofences.remove(id, existing)
    }
}

class GeofenceTelemetryEvaluator(
    private val geofences: GeofenceRepository?,
    private val events: OperationalEventRepository?,
) {
    private val outsideState = ConcurrentHashMap<String, Boolean>()

    fun evaluate(telemetry: TelemetryReadModel, occurredAt: Instant = Instant.now()) {
        val repository = geofences ?: return
        val eventRepository = events ?: return
        val point = GeoPoint(telemetry.latitude, telemetry.longitude)
        repository.findEnabled(telemetry.groupId).forEach { geofence ->
            val stateKey = "${telemetry.groupId.value}:${telemetry.uuid}:${geofence.id}"
            val outside = !geofence.contains(point)
            val wasOutside = outsideState.put(stateKey, outside) ?: false
            if (outside && !wasOutside) {
                eventRepository.append(
                    OperationalEventReadModel(
                        id = UUID.randomUUID().toString(),
                        occurredAt = occurredAt,
                        severity = "warning",
                        category = "geofence",
                        eventType = "geofence.exit",
                        sourceService = "auth-policy",
                        source = telemetry.uuid,
                        message = "Device ${telemetry.uuid} exited geofence ${geofence.name}",
                        connections = 0,
                        latencyMs = 0,
                        throughputMbps = 0.0,
                        groupId = telemetry.groupId,
                    ),
                )
            }
        }
    }

    companion object {
        val NOOP = GeofenceTelemetryEvaluator(null, null)
    }
}

private fun GeoPoint.onSegment(start: GeoPoint, end: GeoPoint): Boolean {
    val cross = (latitude - start.latitude) * (end.longitude - start.longitude) -
        (longitude - start.longitude) * (end.latitude - start.latitude)
    if (kotlin.math.abs(cross) > 1e-10) return false
    return latitude in minOf(start.latitude, end.latitude)..maxOf(start.latitude, end.latitude) &&
        longitude in minOf(start.longitude, end.longitude)..maxOf(start.longitude, end.longitude)
}
