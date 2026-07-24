package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class GeofenceModelsTest {
    private val group = GroupId("operations-a")
    private val polygon = listOf(
        GeoPoint(35.0, 128.0),
        GeoPoint(35.0, 129.0),
        GeoPoint(36.0, 129.0),
        GeoPoint(36.0, 128.0),
    )

    @Test
    fun `polygon includes inside and boundary points and excludes outside points`() {
        val geofence = Geofence("yard", "Operation yard", group, polygon)

        assertTrue(geofence.contains(GeoPoint(35.5, 128.5)))
        assertTrue(geofence.contains(GeoPoint(35.0, 128.5)))
        assertFalse(geofence.contains(GeoPoint(36.1, 128.5)))
    }

    @Test
    fun `repository only exposes geofences in the principal group`() {
        val repository = InMemoryGeofenceRepository()
        repository.save(Geofence("a", "A", group, polygon))
        repository.save(Geofence("b", "B", GroupId("operations-b"), polygon))

        val visible = repository.findVisible(AuthenticatedPrincipal("viewer", UserRole.VIEWER, group))

        assertEquals(listOf("a"), visible.map { it.id })
    }

    @Test
    fun `telemetry outside a geofence emits one exit event until device reenters`() {
        val geofences = InMemoryGeofenceRepository()
        geofences.save(Geofence("yard", "Operation yard", group, polygon))
        val events = InMemoryOperationalEventRepository(emptyList())
        val evaluator = GeofenceTelemetryEvaluator(geofences, events)
        val principal = AuthenticatedPrincipal("viewer", UserRole.VIEWER, group)
        val time = Instant.parse("2026-07-24T00:00:00Z")

        evaluator.evaluate(telemetry(35.5, 128.5), time)
        evaluator.evaluate(telemetry(36.2, 128.5), time.plusSeconds(1))
        evaluator.evaluate(telemetry(36.3, 128.5), time.plusSeconds(2))

        val emitted = events.eventsFor(principal, OperationalEventQuery())
        assertEquals(1, emitted.size)
        assertEquals("geofence.exit", emitted.single().eventType)
        assertEquals("warning", emitted.single().severity)

        evaluator.evaluate(telemetry(35.5, 128.5), time.plusSeconds(3))
        evaluator.evaluate(telemetry(36.2, 128.5), time.plusSeconds(4))
        assertEquals(2, events.eventsFor(principal, OperationalEventQuery()).size)
    }

    private fun telemetry(latitude: Double, longitude: Double) =
        TelemetryReadModel(
            uuid = "device-001",
            latitude = latitude,
            longitude = longitude,
            altitude = 10.0,
            magneticX = 0.0,
            magneticY = 0.0,
            magneticZ = 0.0,
            soc = "80",
            phoneBatterySOC = 80.0,
            velocity = 0.0,
            totalDistance = 0.0,
            epochTime = "00:00:00",
            portDistance = 0.0,
            groupId = group,
        )
}
