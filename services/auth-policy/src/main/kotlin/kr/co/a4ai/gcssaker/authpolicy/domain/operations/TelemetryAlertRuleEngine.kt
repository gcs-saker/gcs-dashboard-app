package kr.co.a4ai.gcssaker.authpolicy.domain

import org.springframework.scheduling.annotation.Scheduled
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs

data class TelemetryAlertThresholds(
    val batteryLowPercent: Double = 20.0,
    val tiltAbnormalDeg: Double = 45.0,
    val linkQualityLowPercent: Double = 30.0,
    val telemetryTimeout: Duration = Duration.ofSeconds(30),
)

class TelemetryAlertRuleEngine(
    private val events: OperationalEventRepository?,
    private val thresholds: TelemetryAlertThresholds = TelemetryAlertThresholds(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private data class DeviceState(val groupId: GroupId, val lastSeenAt: Instant)

    private val activeRules = ConcurrentHashMap<String, Boolean>()
    private val devices = ConcurrentHashMap<String, DeviceState>()

    fun evaluate(telemetry: TelemetryReadModel, receivedAt: Instant = Instant.now(clock)) {
        val observedAt = telemetry.observedAt ?: receivedAt
        devices[telemetry.key()] = DeviceState(telemetry.groupId, observedAt)
        evaluateRule(telemetry, "battery.low", telemetry.batteryPercent?.let { it < thresholds.batteryLowPercent } == true, receivedAt)
        evaluateRule(
            telemetry,
            "tilt.abnormal",
            listOfNotNull(telemetry.rollDeg, telemetry.pitchDeg).any { abs(it) > thresholds.tiltAbnormalDeg },
            receivedAt,
        )
        evaluateRule(
            telemetry,
            "link.quality.low",
            telemetry.linkQualityPercent?.let { it < thresholds.linkQualityLowPercent } == true,
            receivedAt,
        )
        setRuleState(telemetry.key(), "telemetry.timeout", false)
    }

    @Scheduled(fixedDelayString = "\${gcs.alert.timeout-scan-millis:5000}")
    fun scanTimeouts() {
        evaluateTimeouts(Instant.now(clock))
    }

    fun evaluateTimeouts(now: Instant) {
        devices.forEach { (deviceKey, state) ->
            val timedOut = Duration.between(state.lastSeenAt, now) > thresholds.telemetryTimeout
            if (timedOut && activate(deviceKey, "telemetry.timeout")) {
                val deviceId = deviceKey.substringAfter(':')
                appendAlert(deviceId, state.groupId, "telemetry.timeout", now)
            }
            if (timedOut) devices.remove(deviceKey, state)
        }
    }

    private fun evaluateRule(
        telemetry: TelemetryReadModel,
        rule: String,
        breached: Boolean,
        occurredAt: Instant,
    ) {
        if (breached && activate(telemetry.key(), rule)) {
            appendAlert(telemetry.uuid, telemetry.groupId, rule, occurredAt)
        } else if (!breached) {
            setRuleState(telemetry.key(), rule, false)
        }
    }

    private fun appendAlert(deviceId: String, groupId: GroupId, rule: String, occurredAt: Instant) {
        events?.append(
            OperationalEventReadModel(
                id = UUID.randomUUID().toString(),
                occurredAt = occurredAt,
                severity = "warning",
                category = "alert",
                eventType = rule,
                sourceService = "auth-policy",
                source = deviceId,
                message = "Telemetry alert $rule for device $deviceId",
                connections = 0,
                latencyMs = 0,
                throughputMbps = 0.0,
                groupId = groupId,
            ),
        )
    }

    private fun activate(deviceKey: String, rule: String): Boolean =
        activeRules.put("$deviceKey:$rule", true) != true

    private fun setRuleState(deviceKey: String, rule: String, active: Boolean) {
        val key = "$deviceKey:$rule"
        if (active) activeRules[key] = true else activeRules.remove(key)
    }

    private fun TelemetryReadModel.key(): String = "${groupId.value}:$uuid"

    companion object {
        val NOOP = TelemetryAlertRuleEngine(null)
    }
}
