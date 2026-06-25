package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalEventRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import java.time.Instant

class JdbcOperationalEventRepositoryTest {
    @Test
    fun `jdbc operational events are persisted and filtered by group severity query and time range`() {
        val dataSource = h2DataSource()
        val repository = JdbcOperationalEventRepository(
            dataSource,
            listOf(
                event("evt-a-info", "info", "api", "헬스체크 정상", GroupId("co-a"), "2026-06-01T00:00:00Z"),
                event(
                    "evt-a-warn",
                    "warn",
                    "network",
                    "직접 ICE 후보 실패",
                    GroupId("co-a"),
                    "2026-06-01T00:10:00Z",
                    eventType = "ice.relay_fallback",
                    sourceService = "turn",
                    streamId = "raw/local/webcam",
                    connectionId = "conn-whep-001",
                    icePath = "relay",
                    relayFallbackReason = "srflx candidate failed",
                ),
                event("evt-b-warn", "warn", "network", "다른 그룹 ICE 후보 실패", GroupId("co-b"), "2026-06-01T00:10:00Z"),
            ),
        )

        val events = repository.eventsFor(
            AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a")),
            OperationalEventQuery(
                query = "ice",
                severity = "warn",
                from = Instant.parse("2026-06-01T00:09:00Z"),
                to = Instant.parse("2026-06-01T00:11:00Z"),
            ),
        )

        assertEquals(listOf("evt-a-warn"), events.map { it.id })
        assertEquals("ice.relay_fallback", events.single().eventType)
        assertEquals("turn", events.single().sourceService)
        assertEquals("raw/local/webcam", events.single().streamId)
        assertEquals("conn-whep-001", events.single().connectionId)
        assertEquals("relay", events.single().icePath)
        assertEquals("srflx candidate failed", events.single().relayFallbackReason)
    }

    @Test
    fun `jdbc operational event schema creates query path indexes`() {
        val dataSource = h2DataSource()
        JdbcOperationalEventRepository(dataSource, emptyList())
        val indexes = JdbcTemplate(dataSource).queryForList(
            """
            SELECT INDEX_NAME
            FROM INFORMATION_SCHEMA.INDEXES
            WHERE TABLE_NAME = 'OPERATIONAL_EVENTS'
            """.trimIndent(),
            String::class.java,
        ).toSet()

        assertTrue("IX_OPERATIONAL_EVENTS_GROUP_OCCURRED" in indexes)
        assertTrue("IX_OPERATIONAL_EVENTS_GROUP_SEVERITY_OCCURRED" in indexes)
        assertTrue("IX_OPERATIONAL_EVENTS_GROUP_STREAM_OCCURRED" in indexes)
    }

    @Test
    fun `jdbc operational event page uses keyset cursor without skipping rows`() {
        val dataSource = h2DataSource()
        val repository = JdbcOperationalEventRepository(
            dataSource,
            listOf(
                event("evt-003", "info", "api", "세 번째", GroupId("co-a"), "2026-06-01T00:03:00Z"),
                event("evt-002", "info", "api", "두 번째", GroupId("co-a"), "2026-06-01T00:02:00Z"),
                event("evt-001", "info", "api", "첫 번째", GroupId("co-a"), "2026-06-01T00:01:00Z"),
            ),
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))

        val firstPage = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(limit = OperationalEventPageLimit(2)),
        )
        val secondPage = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(
                limit = OperationalEventPageLimit(2),
                after = firstPage.nextCursor,
            ),
        )

        assertEquals(listOf("evt-003", "evt-002"), firstPage.events.map { it.id })
        assertEquals(listOf("evt-001"), secondPage.events.map { it.id })
        assertEquals(null, secondPage.nextCursor)
    }

    @Test
    fun `jdbc operational event keyset query keeps deterministic id order for same timestamp`() {
        val dataSource = h2DataSource()
        val repository = JdbcOperationalEventRepository(
            dataSource,
            listOf(
                event("evt-c", "info", "api", "C", GroupId("co-a"), "2026-06-01T00:03:00Z"),
                event("evt-b", "info", "api", "B", GroupId("co-a"), "2026-06-01T00:03:00Z"),
                event("evt-a", "info", "api", "A", GroupId("co-a"), "2026-06-01T00:03:00Z"),
            ),
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))

        val firstPage = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(limit = OperationalEventPageLimit(1)),
        )
        val secondPage = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(
                limit = OperationalEventPageLimit(2),
                after = firstPage.nextCursor,
            ),
        )

        assertEquals(listOf("evt-c"), firstPage.events.map { it.id })
        assertEquals(listOf("evt-b", "evt-a"), secondPage.events.map { it.id })
    }

    @Test
    fun `jdbc operational event metrics are aggregated in database scope`() {
        val dataSource = h2DataSource()
        val repository = JdbcOperationalEventRepository(
            dataSource,
            listOf(
                event(
                    id = "evt-a-info",
                    severity = "info",
                    category = "api",
                    message = "정상",
                    groupId = GroupId("co-a"),
                    occurredAt = "2026-06-01T00:01:00Z",
                    connections = 2,
                    latencyMs = 30,
                    throughputMbps = 6.0,
                ),
                event(
                    id = "evt-a-warn",
                    severity = "warn",
                    category = "network",
                    message = "지연",
                    groupId = GroupId("co-a"),
                    occurredAt = "2026-06-01T00:02:00Z",
                    connections = 6,
                    latencyMs = 90,
                    throughputMbps = 12.0,
                    eventType = "ice.relay_fallback",
                    sourceService = "turn",
                    streamId = "raw/local/webcam",
                    connectionId = "conn-whep-001",
                    icePath = "relay",
                    relayFallbackReason = "srflx candidate failed",
                ),
                event(
                    id = "evt-b-error",
                    severity = "error",
                    category = "security",
                    message = "다른 그룹",
                    groupId = GroupId("co-b"),
                    occurredAt = "2026-06-01T00:03:00Z",
                    connections = 99,
                    latencyMs = 999,
                    throughputMbps = 999.0,
                ),
            ),
        )

        val metrics = repository.metricsFor(
            AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a")),
            OperationalEventQuery(),
        )

        assertEquals(2, metrics.totalEvents)
        assertEquals(8, metrics.totalConnections)
        assertEquals(30, metrics.minLatencyMs)
        assertEquals(60.0, metrics.avgLatencyMs)
        assertEquals(90, metrics.maxLatencyMs)
        assertEquals(9.0, metrics.avgThroughputMbps)
        assertEquals(listOf("info", "warn"), metrics.severityCounts.map { it.severity })
        assertEquals(listOf("relay"), metrics.icePathCounts.map { it.icePath })
        assertEquals(1, metrics.icePathCounts.single().count)
        assertEquals(listOf("raw/local/webcam"), metrics.streamSessions.map { it.streamId })
        assertEquals("conn-whep-001", metrics.streamSessions.single().connectionId)
        assertEquals("relay", metrics.streamSessions.single().icePath)
    }

    private fun event(
        id: String,
        severity: String,
        category: String,
        message: String,
        groupId: GroupId,
        occurredAt: String,
        connections: Int = 1,
        latencyMs: Long = 42,
        throughputMbps: Double = 1.2,
        eventType: String? = null,
        sourceService: String? = null,
        streamId: String? = null,
        connectionId: String? = null,
        icePath: String? = null,
        relayFallbackReason: String? = null,
    ): OperationalEventReadModel =
        OperationalEventReadModel(
            id = id,
            occurredAt = Instant.parse(occurredAt),
            severity = severity,
            category = category,
            eventType = eventType,
            sourceService = sourceService,
            source = "테스트",
            message = message,
            connections = connections,
            latencyMs = latencyMs,
            throughputMbps = throughputMbps,
            groupId = groupId,
            streamId = streamId,
            connectionId = connectionId,
            icePath = icePath,
            relayFallbackReason = relayFallbackReason,
        )

    private fun h2DataSource(): DriverManagerDataSource =
        DriverManagerDataSource().apply {
            setDriverClassName("org.h2.Driver")
            url = "jdbc:h2:mem:${java.util.UUID.randomUUID()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
            username = "sa"
            password = ""
        }
}
