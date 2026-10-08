package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import kr.co.a4ai.gcssaker.authpolicy.application.LocalOperationalEventSignal
import kr.co.a4ai.gcssaker.authpolicy.application.SignalingOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class OperationalEventStreamWakeupTest {
    @Test
    fun `event signal wakes the stream before fallback polling`() {
        val signal = LocalOperationalEventSignal()
        val repository = SignalingOperationalEventRepository(InMemoryOperationalEventRepository(emptyList()), signal)
        val writer = OperationalEventStreamWriter(
            repository = repository,
            objectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()),
            streamPolicy = OperationalEventStreamPolicy(
                pollCount = 30,
                pollIntervalMillis = 1_000,
                fallbackPollIntervalMillis = 5_000,
            ),
            signal = signal,
        )
        val output = ThreadSafeStreamOutput()
        val executor = Executors.newSingleThreadExecutor()
        val stream = executor.submit { writer.body(principal(), OperationalEventQuery()).writeTo(output) }
        try {
            assertTrue(output.firstFlush.await(10, TimeUnit.SECONDS))
            repository.append(event("evt-signal", Instant.now().plusSeconds(1)))

            assertTrue(waitUntil { output.snapshot().contains("evt-signal") }, output.snapshot())
        } finally {
            stream.cancel(true)
            executor.shutdownNow()
        }
    }

    private fun principal() = AuthenticatedPrincipal("viewer", UserRole.VIEWER, GroupId("co-a"))

    private fun event(id: String, occurredAt: Instant) = OperationalEventReadModel(
        id = id, occurredAt = occurredAt, severity = "info", category = "api",
        source = "test", message = "signal", connections = 1, latencyMs = 1,
        throughputMbps = 1.0, groupId = GroupId("co-a"),
    )

    private fun waitUntil(condition: () -> Boolean): Boolean {
        repeat(100) {
            if (condition()) return true
            Thread.sleep(10)
        }
        return false
    }
}

private class ThreadSafeStreamOutput : OutputStream() {
    private val delegate = ByteArrayOutputStream()
    val firstFlush = CountDownLatch(1)

    @Synchronized
    override fun write(value: Int) {
        delegate.write(value)
    }

    @Synchronized
    override fun write(value: ByteArray) {
        delegate.write(value)
    }

    override fun flush() {
        firstFlush.countDown()
    }

    @Synchronized
    fun snapshot(): String = delegate.toString(Charsets.UTF_8)
}
