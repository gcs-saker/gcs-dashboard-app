package kr.co.a4ai.gcssaker.authpolicy.observability

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import java.util.concurrent.atomic.AtomicInteger

class TelemetryWebSocketMetrics(registry: MeterRegistry? = null) {
    private val active = AtomicInteger()
    private val queueDepth = AtomicInteger()
    private val queued = registry?.counter("gcs.auth_policy.telemetry.websocket.queued")
    private val sent = registry?.counter("gcs.auth_policy.telemetry.websocket.sent")
    private val backpressure = registry?.counter("gcs.auth_policy.telemetry.websocket.backpressure")
    private val failures = registry?.counter("gcs.auth_policy.telemetry.websocket.failed")

    init {
        registry?.let {
            Gauge.builder("gcs.auth_policy.telemetry.websocket.active", active) { value -> value.get().toDouble() }.register(it)
            Gauge.builder("gcs.auth_policy.telemetry.websocket.queue.depth", queueDepth) { value -> value.get().toDouble() }.register(it)
        }
    }

    fun connected() {
        active.incrementAndGet()
    }

    fun disconnected() {
        active.updateAndGet { current -> (current - 1).coerceAtLeast(0) }
    }

    fun queued() {
        queueDepth.incrementAndGet()
        queued?.increment()
    }

    fun dequeued() {
        queueDepth.updateAndGet { current -> (current - 1).coerceAtLeast(0) }
    }

    fun discarded(count: Int) {
        queueDepth.updateAndGet { current -> (current - count).coerceAtLeast(0) }
    }

    fun sent() {
        sent?.increment()
    }

    fun backpressured() {
        backpressure?.increment()
    }

    fun failed() {
        failures?.increment()
    }
}
