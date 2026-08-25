package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class TelemetryAlertRuleEngineTest {
    private val group = GroupId("operations")
    private val principal = AuthenticatedPrincipal("operator", UserRole.VIEWER, group)
    private val now = Instant.parse("2026-07-24T00:00:00Z")
    private val events = InMemoryOperationalEventRepository(emptyList())
    private val engine = TelemetryAlertRuleEngine(
        events,
        TelemetryAlertThresholds(20.0, 45.0, 30.0, Duration.ofSeconds(30)),
        Clock.fixed(now, ZoneOffset.UTC),
    )

    @Test
    fun `emits battery tilt and link alerts once while each breach remains active`() {
        val breached = telemetry(battery = 19.0, roll = 46.0, link = 29.0)

        engine.evaluate(breached, now)
        engine.evaluate(breached, now.plusSeconds(1))

        assertEquals(
            setOf("battery.low", "tilt.abnormal", "link.quality.low"),
            eventTypes(),
        )
        assertEquals(3, events.eventsFor(principal, OperationalEventQuery()).size)
        events.eventsFor(principal, OperationalEventQuery()).forEach { event ->
            assertEquals("warn", event.severity)
            assertEquals("security", event.category)
            assertEquals("telemetry-monitor", event.source)
            assertEquals(false, event.message.contains("device-001"))
        }
    }

    @Test
    fun `rearms a rule after telemetry returns to normal`() {
        engine.evaluate(telemetry(battery = 10.0), now)
        engine.evaluate(telemetry(battery = 80.0), now.plusSeconds(1))
        engine.evaluate(telemetry(battery = 10.0), now.plusSeconds(2))

        assertEquals(2, events.eventsFor(principal, OperationalEventQuery()).count { it.eventType == "battery.low" })
    }

    @Test
    fun `emits telemetry timeout and rearms after a new sample`() {
        engine.evaluate(telemetry(observedAt = now), now)
        engine.evaluateTimeouts(now.plusSeconds(31))
        engine.evaluateTimeouts(now.plusSeconds(60))
        assertEquals(1, events.eventsFor(principal, OperationalEventQuery()).count { it.eventType == "telemetry.timeout" })

        engine.evaluate(telemetry(observedAt = now.plusSeconds(61)), now.plusSeconds(61))
        engine.evaluateTimeouts(now.plusSeconds(92))
        assertEquals(2, events.eventsFor(principal, OperationalEventQuery()).count { it.eventType == "telemetry.timeout" })
    }

    private fun eventTypes(): Set<String?> =
        events.eventsFor(principal, OperationalEventQuery()).map { it.eventType }.toSet()

    private fun telemetry(
        battery: Double? = 80.0,
        roll: Double? = 0.0,
        link: Double? = 100.0,
        observedAt: Instant = now,
    ) = TelemetryReadModel(
        uuid = "device-001",
        latitude = 35.0,
        longitude = 128.0,
        altitude = 10.0,
        magneticX = 0.0,
        magneticY = 0.0,
        magneticZ = 0.0,
        soc = "80",
        phoneBatterySOC = battery ?: 0.0,
        velocity = 0.0,
        totalDistance = 0.0,
        epochTime = "00:00:00",
        portDistance = 0.0,
        groupId = group,
        batteryPercent = battery,
        rollDeg = roll,
        pitchDeg = 0.0,
        linkQualityPercent = link,
        observedAt = observedAt,
    )
}
