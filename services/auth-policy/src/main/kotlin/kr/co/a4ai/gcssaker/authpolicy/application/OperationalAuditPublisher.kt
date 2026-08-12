package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import org.springframework.core.task.TaskExecutor
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

data class OperationalAuditRecord(
    val principal: AuthenticatedPrincipal,
    val query: OperationalEventQuery,
    val resultCount: Int,
    val occurredAt: Instant,
)

interface OperationalAuditSink {
    fun append(record: OperationalAuditRecord)
}

class InMemoryOperationalAuditSink(
    private val capacity: Int = DEFAULT_CAPACITY,
) : OperationalAuditSink {
    private val records = ArrayDeque<OperationalAuditRecord>()

    init {
        require(capacity > 0) { "operational audit capacity must be positive" }
    }

    @Synchronized
    override fun append(record: OperationalAuditRecord) {
        if (records.size == capacity) records.removeFirst()
        records.addLast(record)
    }

    @Synchronized
    fun snapshot(): List<OperationalAuditRecord> = records.toList()

    private companion object {
        const val DEFAULT_CAPACITY = 1_000
    }
}

interface OperationalAuditPublisher {
    fun publish(principal: AuthenticatedPrincipal, query: OperationalEventQuery, resultCount: Int)
}

data class OperationalAuditPublisherSnapshot(
    val submitted: Long,
    val failed: Long,
)

class OperationalAuditPublisherMetrics {
    private val submitted = AtomicLong()
    private val failed = AtomicLong()

    fun recordSubmitted() {
        submitted.incrementAndGet()
    }

    fun recordFailed() {
        failed.incrementAndGet()
    }

    fun snapshot(): OperationalAuditPublisherSnapshot =
        OperationalAuditPublisherSnapshot(
            submitted = submitted.get(),
            failed = failed.get(),
        )
}

object NoopOperationalAuditPublisher : OperationalAuditPublisher {
    override fun publish(principal: AuthenticatedPrincipal, query: OperationalEventQuery, resultCount: Int) = Unit
}

class AsyncOperationalAuditPublisher(
    private val executor: TaskExecutor,
    private val sink: OperationalAuditSink,
    private val metrics: OperationalAuditPublisherMetrics = OperationalAuditPublisherMetrics(),
    private val now: () -> Instant = Instant::now,
) : OperationalAuditPublisher {
    override fun publish(principal: AuthenticatedPrincipal, query: OperationalEventQuery, resultCount: Int) {
        runCatching {
            executor.execute {
                runCatching {
                    sink.append(
                        OperationalAuditRecord(
                            principal = principal,
                            query = query,
                            resultCount = resultCount,
                            occurredAt = now(),
                        ),
                    )
                }.onFailure {
                    metrics.recordFailed()
                }
            }
            metrics.recordSubmitted()
        }.onFailure {
            metrics.recordFailed()
        }
    }
}
