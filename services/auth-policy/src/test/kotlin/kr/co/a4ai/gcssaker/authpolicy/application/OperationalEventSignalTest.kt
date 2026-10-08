package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class OperationalEventSignalTest {
    @Test
    fun `local signal wakes a waiter without losing an early notification`() {
        val signal = LocalOperationalEventSignal()
        val observed = signal.snapshot()
        signal.publish()
        val executor = Executors.newSingleThreadExecutor()
        try {
            val result = executor.submit<Long> { signal.awaitChange(observed, 1_000) }.get(1, TimeUnit.SECONDS)
            assertEquals(observed + 1, result)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `repository signals only after a successful append`() {
        val signal = LocalOperationalEventSignal()
        val repository = SignalingOperationalEventRepository(RecordingEventRepository(), signal)
        val before = signal.snapshot()

        repository.append(event("stored"))

        assertEquals(before + 1, signal.snapshot())
    }

    @Test
    fun `failed append does not publish a false wakeup`() {
        val signal = LocalOperationalEventSignal()
        val repository = SignalingOperationalEventRepository(FailingEventRepository, signal)
        val before = signal.snapshot()

        assertThrows(IllegalStateException::class.java) { repository.append(event("failed")) }

        assertEquals(before, signal.snapshot())
    }

    private fun event(id: String) = OperationalEventReadModel(
        id = id, occurredAt = Instant.now(), severity = "info", category = "api",
        source = "test", message = "event", connections = 1, latencyMs = 1,
        throughputMbps = 1.0, groupId = GroupId("co-a"),
    )
}

private class RecordingEventRepository : OperationalEventRepository {
    override fun eventsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery) = emptyList<OperationalEventReadModel>()
    override fun append(event: OperationalEventReadModel) = Unit
}

private object FailingEventRepository : OperationalEventRepository {
    override fun eventsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery) = emptyList<OperationalEventReadModel>()
    override fun append(event: OperationalEventReadModel) = throw IllegalStateException("append failed")
}
