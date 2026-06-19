package kr.co.a4ai.gcssaker.authpolicy

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisCachePolicy
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.StringKeyValueStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class OperationalReadCacheTest {
    private val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))
    private val policy = RedisCachePolicy("gcs:ops-read:", Duration.ofSeconds(3), ttlJitterRatio = 0.0)

    @Test
    fun `redis operational read cache avoids repeated stream session reads`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalReadRepository()
        val repository = RedisOperationalReadRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = policy,
        )

        assertEquals("raw.mobile.front", repository.streamSessionsFor(principal).single().streamId)
        assertEquals("raw.mobile.front", repository.streamSessionsFor(principal).single().streamId)

        assertEquals(1, delegate.streamReads)
        assertEquals(2, store.keys().size)
        assertTrue(store.keys().any { it.startsWith("gcs:ops-read:") })
        assertTrue(store.keys().any { it.startsWith("gcs:ops-read:stale:") })
    }

    @Test
    fun `stream session write invalidates latest cache so next read observes new status`() {
        val store = InMemoryStringKeyValueStore()
        val delegate = RecordingOperationalReadRepository()
        val repository = RedisOperationalReadRepository(
            delegate = delegate,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = policy,
        )

        assertEquals(StreamSessionStatus.CONNECTED.value, repository.streamSessionsFor(principal).single().status)

        repository.recordStreamSession(
            streamSession(
                status = StreamSessionStatus.DISCONNECTED.value,
                heartbeat = Instant.parse("2026-06-01T00:00:20Z"),
            ),
        )

        assertEquals(StreamSessionStatus.DISCONNECTED.value, repository.streamSessionsFor(principal).single().status)
        assertEquals(2, delegate.streamReads)
    }

    @Test
    fun `redis operational read cache falls back to repository when redis is unavailable`() {
        val delegate = RecordingOperationalReadRepository()
        val repository = RedisOperationalReadRepository(
            delegate = delegate,
            store = FailingStringKeyValueStore,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = policy,
        )

        assertEquals("raw.mobile.front", repository.streamSessionsFor(principal).single().streamId)
        assertEquals(1, delegate.streamReads)
    }

    @Test
    fun `redis operational read cache serves stale stream sessions when backing repository fails`() {
        val store = InMemoryStringKeyValueStore()
        RedisOperationalReadRepository(
            delegate = RecordingOperationalReadRepository(),
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = policy,
        ).streamSessionsFor(principal)
        val freshKey = store.keys().single { !it.startsWith("gcs:ops-read:stale:") }
        store.set(freshKey, "broken", Duration.ofSeconds(3))

        val repository = RedisOperationalReadRepository(
            delegate = FailingOperationalReadRepository,
            store = store,
            objectMapper = jacksonObjectMapper().findAndRegisterModules(),
            policy = policy,
        )

        assertEquals("raw.mobile.front", repository.streamSessionsFor(principal).single().streamId)
    }

    private enum class StreamSessionStatus(val value: String) {
        CONNECTED("connected"),
        DISCONNECTED("disconnected"),
    }

    private class RecordingOperationalReadRepository : OperationalReadRepository {
        private val sessions = mutableListOf(streamSession())
        var streamReads = 0

        override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> = emptyList()

        override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel = telemetry

        override fun telemetryHistoryFor(
            principal: AuthenticatedPrincipal,
            uuid: String,
            limit: Int,
        ): List<TelemetryHistoryReadModel> = emptyList()

        override fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel> = emptyList()

        override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel =
            snapshot

        override fun serverHealthSnapshotsFor(
            principal: AuthenticatedPrincipal,
            limit: Int,
        ): List<ServerHealthSnapshotReadModel> = emptyList()

        override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel {
            sessions += session
            return session
        }

        override fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel> {
            streamReads += 1
            return sessions
                .groupBy { "${it.streamId}|${it.sessionId.orEmpty()}" }
                .values
                .map { entries -> entries.maxBy { it.lastHeartbeatAt } }
        }
    }

    private object FailingOperationalReadRepository : OperationalReadRepository {
        override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> = error("database unavailable")

        override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel = error("database unavailable")

        override fun telemetryHistoryFor(
            principal: AuthenticatedPrincipal,
            uuid: String,
            limit: Int,
        ): List<TelemetryHistoryReadModel> = error("database unavailable")

        override fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel> =
            error("database unavailable")

        override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel =
            error("database unavailable")

        override fun serverHealthSnapshotsFor(
            principal: AuthenticatedPrincipal,
            limit: Int,
        ): List<ServerHealthSnapshotReadModel> = error("database unavailable")

        override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel = error("database unavailable")

        override fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel> =
            error("database unavailable")
    }

    private class InMemoryStringKeyValueStore : StringKeyValueStore {
        private val values = linkedMapOf<String, String>()

        @Synchronized
        override fun get(key: String): String? = values[key]

        @Synchronized
        override fun getAndDelete(key: String): String? = values.remove(key)

        @Synchronized
        override fun set(key: String, value: String, ttl: Duration) {
            values[key] = value
        }

        @Synchronized
        override fun delete(key: String) {
            values.remove(key)
        }

        @Synchronized
        fun keys(): List<String> = values.keys.toList()
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

private fun streamSession(
    status: String = "connected",
    heartbeat: Instant = Instant.parse("2026-06-01T00:00:10Z"),
): StreamSessionReadModel =
    StreamSessionReadModel(
        streamId = "raw.mobile.front",
        sessionId = "session-1",
        status = status,
        source = "media-control",
        startedAt = Instant.parse("2026-06-01T00:00:00Z"),
        lastHeartbeatAt = heartbeat,
        stoppedAt = null,
        groupId = GroupId("co-a"),
    )
