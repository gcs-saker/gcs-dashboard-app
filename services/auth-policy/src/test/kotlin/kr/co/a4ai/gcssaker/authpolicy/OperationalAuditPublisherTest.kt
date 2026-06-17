package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.application.AsyncOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.InMemoryOperationalAuditSink
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisherMetrics
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditRecord
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditSink
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Test
import org.springframework.core.task.SyncTaskExecutor
import org.springframework.core.task.TaskExecutor
import java.time.Instant
import java.util.concurrent.RejectedExecutionException

class OperationalAuditPublisherTest {
    @Test
    fun `async audit publisher delegates post processing outside auth result calculation`() {
        val sink = InMemoryOperationalAuditSink()
        val metrics = OperationalAuditPublisherMetrics()
        val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))
        val query = OperationalEventQuery(severity = "warn")
        val publisher = AsyncOperationalAuditPublisher(
            executor = SyncTaskExecutor(),
            sink = sink,
            metrics = metrics,
            now = { Instant.parse("2026-06-01T00:00:00Z") },
        )

        publisher.publish(principal, query, 3)

        val record = sink.snapshot().single()
        assertEquals(principal, record.principal)
        assertEquals(query, record.query)
        assertEquals(3, record.resultCount)
        assertEquals(Instant.parse("2026-06-01T00:00:00Z"), record.occurredAt)
        assertEquals(1, metrics.snapshot().submitted)
        assertEquals(0, metrics.snapshot().failed)
    }

    @Test
    fun `publisher isolates rejected executor and records failure`() {
        val metrics = OperationalAuditPublisherMetrics()
        val publisher = AsyncOperationalAuditPublisher(
            executor = RejectingTaskExecutor,
            sink = InMemoryOperationalAuditSink(),
            metrics = metrics,
        )

        assertDoesNotThrow {
            publisher.publish(OperationalAuditFixtures.principal, OperationalAuditFixtures.query, 1)
        }

        assertEquals(0, metrics.snapshot().submitted)
        assertEquals(1, metrics.snapshot().failed)
    }

    @Test
    fun `publisher isolates sink failure inside post processing task`() {
        val metrics = OperationalAuditPublisherMetrics()
        val publisher = AsyncOperationalAuditPublisher(
            executor = SyncTaskExecutor(),
            sink = ThrowingOperationalAuditSink,
            metrics = metrics,
        )

        assertDoesNotThrow {
            publisher.publish(OperationalAuditFixtures.principal, OperationalAuditFixtures.query, 1)
        }

        assertEquals(1, metrics.snapshot().submitted)
        assertEquals(1, metrics.snapshot().failed)
    }

    private object OperationalAuditFixtures {
        val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))
        val query = OperationalEventQuery(severity = "warn")
    }

    private object RejectingTaskExecutor : TaskExecutor {
        override fun execute(task: Runnable) {
            throw RejectedExecutionException("post processing queue is full")
        }
    }

    private object ThrowingOperationalAuditSink : OperationalAuditSink {
        override fun append(record: OperationalAuditRecord) {
            error("audit sink failed")
        }
    }
}
