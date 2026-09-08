package kr.co.a4ai.gcssaker.authpolicy.observability

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import java.util.concurrent.atomic.AtomicInteger

class OperationalEventPipelineMetrics(registry: MeterRegistry? = null) {
    private val activeStreams = AtomicInteger()
    private val acceptedEvents = registry?.counter("gcs.auth_policy.operational_events.accepted")
    private val saturatedBatches = registry?.counter("gcs.auth_policy.operational_events.batch.saturated")
    private val queriedRows = registry?.summary("gcs.auth_policy.operational_events.query.rows")
    private val queryLatency = registry?.timer("gcs.auth_policy.operational_events.query.latency")

    init {
        registry?.let {
            Gauge.builder("gcs.auth_policy.operational_events.sse.active", activeStreams) { it.get().toDouble() }
                .register(it)
        }
    }

    fun streamOpened() {
        activeStreams.incrementAndGet()
    }

    fun streamClosed() {
        activeStreams.updateAndGet { current -> (current - 1).coerceAtLeast(0) }
    }

    fun recordBatch(rowCount: Int, limit: Int) {
        queriedRows?.record(rowCount.toDouble())
        acceptedEvents?.increment(rowCount.toDouble())
        if (rowCount >= limit) saturatedBatches?.increment()
    }

    fun <T> measureQuery(operation: () -> T): T =
        queryLatency?.recordCallable { operation() } ?: operation()
}
