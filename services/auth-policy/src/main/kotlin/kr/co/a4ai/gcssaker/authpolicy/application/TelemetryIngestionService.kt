package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryAlertRuleEngine
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import java.time.Clock
import java.time.Instant

class TelemetryIngestionService(
    private val repository: OperationalReadRepository,
    private val effects: TelemetryIngestionEffects,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun ingest(sample: TelemetryReadModel): TelemetryReadModel {
        val stored = repository.upsertTelemetry(sample)
        val now = Instant.now(clock)
        effects.geofence.evaluate(stored, now)
        effects.alerts.evaluate(stored, now)
        effects.publisher.publish(stored)
        return stored
    }
}

data class TelemetryIngestionEffects(
    val geofence: GeofenceTelemetryEvaluator,
    val alerts: TelemetryAlertRuleEngine,
    val publisher: TelemetryPublisher,
)
