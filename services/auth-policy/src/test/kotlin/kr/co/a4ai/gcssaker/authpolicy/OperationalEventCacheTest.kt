package kr.co.a4ai.gcssaker.authpolicy

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisCachePolicy
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.StringKeyValueStore
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class OperationalEventCacheTest {
    private val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))

    @Test
    fun `redis operational event cache avoids repeated repository reads`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )
        val query = OperationalEventQuery(severity = "warn")

        assertEquals("evt-001", repository.eventsFor(principal, query).single().id)
        assertEquals("evt-001", repository.eventsFor(principal, query).single().id)

        assertEquals(1, delegate.reads)
        assertEquals(2, store.keys().size)
        assertTrue(store.keys().any { it.startsWith("gcs:ops-events:") })
        assertTrue(store.keys().any { it.startsWith("gcs:ops-events:stale:") })
    }

    @Test
    fun `redis operational event cache falls back to repository when cached payload is malformed`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("test:", Duration.ofSeconds(5)),
        )

        repository.eventsFor(principal, OperationalEventQuery())
        val freshKey = store.keys().single { !it.startsWith("test:stale:") }
        store.set(freshKey, "broken", Duration.ofSeconds(5))

        assertEquals("evt-001", repository.eventsFor(principal, OperationalEventQuery()).single().id)
        assertEquals(2, delegate.reads)
    }

    @Test
    fun `redis operational event cache falls back to repository when redis is unavailable`() {
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = FailingStringKeyValueStore,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )

        assertEquals("evt-001", repository.eventsFor(principal, OperationalEventQuery()).single().id)
        assertEquals(1, delegate.reads)
    }

    @Test
    fun `redis operational event cache delegates keyset page reads to backing repository`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )

        repository.eventPageFor(principal, OperationalEventPageQuery())

        assertEquals(1, delegate.pageReads)
        assertEquals(0, delegate.reads)
        assertTrue(store.keys().isEmpty())
    }

    @Test
    fun `redis operational event cache delegates metrics reads during redis outage`() {
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = FailingStringKeyValueStore,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )

        val metrics = repository.metricsFor(principal, OperationalEventQuery())

        assertEquals(1, metrics.totalEvents)
        assertEquals(1, delegate.metricsReads)
        assertEquals(0, delegate.reads)
    }

    @Test
    fun `redis operational event cache serves stale events when backing repository fails`() {
        val store = InMemoryStringKeyValueStore()
        val warmupRepository = RedisOperationalEventRepository(
            delegate = RecordingOperationalEventRepository(),
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )
        warmupRepository.eventsFor(principal, OperationalEventQuery(severity = "warn"))
        store.delete(store.keys().single { !it.startsWith("gcs:ops-events:stale:") })

        val repository = RedisOperationalEventRepository(
            delegate = FailingOperationalEventRepository,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ofSeconds(5)),
        )

        val events = repository.eventsFor(principal, OperationalEventQuery(severity = "warn"))

        assertEquals("evt-001", events.single().id)
        assertEquals("warn", events.single().severity)
    }

    @Test
    fun `redis operational event cache jitters fresh ttl to avoid stampede`() {
        val store = InMemoryStringKeyValueStore()
        val repository = RedisOperationalEventRepository(
            delegate = RecordingOperationalEventRepository(),
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy(
                keyPrefix = "gcs:ops-events:",
                ttl = Duration.ofSeconds(10),
                staleTtl = Duration.ofSeconds(60),
                ttlJitterRatio = 0.2,
            ),
            jitterSource = { 0.5 },
        )

        repository.eventsFor(principal, OperationalEventQuery())

        val freshKey = store.keys().single { !it.startsWith("gcs:ops-events:stale:") }
        assertEquals(Duration.ofSeconds(11), store.ttlFor(freshKey))
    }

    @Test
    fun `redis operational event cache skips writes when ttl disables cacheability`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalEventRepository()
        val repository = RedisOperationalEventRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = RedisCachePolicy("gcs:ops-events:", Duration.ZERO),
        )

        repository.eventsFor(principal, OperationalEventQuery())
        repository.eventsFor(principal, OperationalEventQuery())

        assertEquals(2, delegate.reads)
        assertTrue(store.keys().isEmpty())
    }

    private class RecordingOperationalEventRepository : OperationalEventRepository {
        var reads = 0
        var pageReads = 0
        var metricsReads = 0

        override fun eventsFor(
            principal: AuthenticatedPrincipal,
            query: OperationalEventQuery,
        ): List<OperationalEventReadModel> {
            reads += 1
            return eventList(principal, query)
        }

        override fun eventPageFor(
            principal: AuthenticatedPrincipal,
            query: OperationalEventPageQuery,
        ): OperationalEventPage {
            pageReads += 1
            return OperationalEventPage(
                events = eventList(principal, query.filter),
                nextCursor = null,
            )
        }

        override fun metricsFor(
            principal: AuthenticatedPrincipal,
            query: OperationalEventQuery,
        ): OperationalEventMetrics {
            metricsReads += 1
            val events = eventList(principal, query)
            return OperationalEventMetrics(
                totalEvents = events.size.toLong(),
                totalConnections = events.sumOf { it.connections }.toLong(),
                minLatencyMs = events.minOfOrNull { it.latencyMs },
                avgLatencyMs = events.map { it.latencyMs }.average(),
                maxLatencyMs = events.maxOfOrNull { it.latencyMs },
                avgThroughputMbps = events.map { it.throughputMbps }.average(),
                severityCounts = emptyList(),
            )
        }

        private fun eventList(
            principal: AuthenticatedPrincipal,
            query: OperationalEventQuery,
        ): List<OperationalEventReadModel> =
            listOf(
                OperationalEventReadModel(
                    id = "evt-001",
                    occurredAt = Instant.parse("2026-06-01T00:00:00Z"),
                    severity = query.severity ?: "info",
                    category = "api",
                    source = "API 서버",
                    message = "헬스체크 정상",
                    connections = 1,
                    latencyMs = 42,
                    throughputMbps = 1.2,
                    groupId = principal.groupId,
                ),
            )
    }

    private object FailingOperationalEventRepository : OperationalEventRepository {
        override fun eventsFor(
            principal: AuthenticatedPrincipal,
            query: OperationalEventQuery,
        ): List<OperationalEventReadModel> = error("database unavailable")
    }

    private class InMemoryStringKeyValueStore : StringKeyValueStore {
        private val values = linkedMapOf<String, String>()
        private val ttls = linkedMapOf<String, Duration>()

        @Synchronized
        override fun get(key: String): String? = values[key]

        @Synchronized
        override fun getAndDelete(key: String): String? = values.remove(key)

        @Synchronized
        override fun set(key: String, value: String, ttl: Duration) {
            values[key] = value
            ttls[key] = ttl
        }

        @Synchronized
        override fun delete(key: String) {
            values.remove(key)
            ttls.remove(key)
        }

        @Synchronized
        fun keys(): List<String> = values.keys.toList()

        @Synchronized
        fun ttlFor(key: String): Duration? = ttls[key]
    }

    private object FailingStringKeyValueStore : StringKeyValueStore {
        override fun get(key: String): String? = error("redis unavailable")

        override fun getAndDelete(key: String): String? = error("redis unavailable")

        override fun set(key: String, value: String, ttl: Duration) {
            error("redis unavailable")
        }

        override fun delete(key: String) {
            error("redis unavailable")
        }
    }
}
