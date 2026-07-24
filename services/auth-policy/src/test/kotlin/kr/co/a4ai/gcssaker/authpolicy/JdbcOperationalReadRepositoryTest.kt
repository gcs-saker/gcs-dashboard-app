package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.OperationalReadSql
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import java.time.Instant

class JdbcOperationalReadRepositoryTest {
    private val timestamp = Instant.parse("2026-05-29T00:00:00Z")

    @Test
    fun `jdbc operational read repository persists latest telemetry and filters by group`() {
        val repository = JdbcOperationalReadRepository(
            h2DataSource(),
            telemetry = listOf(
                telemetry("raw.a", GroupId("co-a")),
                telemetry("raw.b", GroupId("co-b")),
            ),
            assetsByGateway = emptyMap(),
        )

        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))
        val before = repository.telemetryFor(principal)
        repository.upsertTelemetry(
            telemetry("raw.mobile", GroupId("co-a"), latitude = 35.88).copy(
                batteryPercent = 74.0,
                headingDeg = 121.0,
                rollDeg = 2.0,
                pitchDeg = -1.0,
                yawDeg = 120.0,
                linkQualityPercent = 92.0,
                observedAt = timestamp,
            ),
        )
        val after = repository.telemetryFor(principal)
        val mobile = after.single { it.uuid == "raw.mobile" }

        assertEquals(listOf("raw.a"), before.map { it.uuid })
        assertEquals(35.88, mobile.latitude)
        assertEquals(74.0, mobile.batteryPercent)
        assertEquals(121.0, mobile.headingDeg)
        assertEquals(2.0, mobile.rollDeg)
        assertEquals(-1.0, mobile.pitchDeg)
        assertEquals(120.0, mobile.yawDeg)
        assertEquals(92.0, mobile.linkQualityPercent)
        assertEquals(timestamp, mobile.observedAt)
        assertTrue(after.none { it.uuid == "raw.b" })
    }

    @Test
    fun `jdbc operational read repository separates latest telemetry from history samples`() {
        val repository = JdbcOperationalReadRepository(
            h2DataSource(),
            telemetry = emptyList(),
            assetsByGateway = emptyMap(),
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))

        repository.upsertTelemetry(telemetry("raw.history", GroupId("co-a"), latitude = 35.88))
        repository.upsertTelemetry(telemetry("raw.history", GroupId("co-a"), latitude = 35.89))

        val latest = repository.telemetryFor(principal).single { it.uuid == "raw.history" }
        val history = repository.telemetryHistoryFor(principal, "raw.history", 10)

        assertEquals(35.89, latest.latitude)
        assertEquals(setOf(35.88, 35.89), history.map { it.telemetry.latitude }.toSet())
    }

    @Test
    fun `jdbc operational read repository persists gateway assets with group filter`() {
        val repository = JdbcOperationalReadRepository(
            h2DataSource(),
            telemetry = emptyList(),
            assetsByGateway = mapOf(
                "raw.a" to listOf(asset("DRN-01", GroupId("co-a"))),
                "raw.b" to listOf(asset("DRN-02", GroupId("co-b"))),
            ),
        )

        val assets = repository.assetsForGateway(
            AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a")),
            "raw.a",
        )
        val hiddenAssets = repository.assetsForGateway(
            AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a")),
            "raw.b",
        )

        assertEquals(listOf("DRN-01"), assets.map { it.uuid })
        assertTrue(hiddenAssets.isEmpty())
    }

    @Test
    fun `jdbc operational read schema creates telemetry and asset indexes`() {
        val dataSource = h2DataSource()
        JdbcOperationalReadRepository(dataSource, emptyList(), emptyMap())
        val indexes = JdbcTemplate(dataSource).queryForList(
            """
            SELECT INDEX_NAME
            FROM INFORMATION_SCHEMA.INDEXES
            WHERE TABLE_NAME IN (
                'TELEMETRY_LATEST',
                'TELEMETRY_HISTORY',
                'GATEWAY_ASSETS',
                'SERVER_HEALTH_SNAPSHOTS',
                'STREAM_SESSIONS'
            )
            """.trimIndent(),
            String::class.java,
        ).toSet()

        assertTrue("IX_TELEMETRY_LATEST_GROUP_UUID" in indexes)
        assertTrue("IX_TELEMETRY_HISTORY_UUID_RECORDED" in indexes)
        assertTrue("IX_GATEWAY_ASSETS_GATEWAY_GROUP" in indexes)
        assertTrue("IX_SERVER_HEALTH_GROUP_CHECKED" in indexes)
        assertTrue("IX_SERVER_HEALTH_GROUP_SERVICE_CHECKED" in indexes)
        assertTrue("IX_STREAM_SESSIONS_GROUP_STREAM_HEARTBEAT" in indexes)
        assertTrue("IX_STREAM_SESSIONS_GROUP_STATUS_HEARTBEAT" in indexes)
    }

    @Test
    fun `jdbc operational read repository stores server health snapshots as history`() {
        val repository = JdbcOperationalReadRepository(h2DataSource(), emptyList(), emptyMap())
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))

        repository.recordServerHealthSnapshot(
            ServerHealthSnapshotReadModel(
                serviceName = "api",
                status = "healthy",
                checkedAt = timestamp,
                latencyMs = 42,
                message = "ok",
                groupId = GroupId("co-a"),
            ),
        )
        repository.recordServerHealthSnapshot(
            ServerHealthSnapshotReadModel(
                serviceName = "signaling",
                status = "degraded",
                checkedAt = timestamp.plusSeconds(10),
                latencyMs = 120,
                message = "slow",
                groupId = GroupId("co-a"),
            ),
        )

        val snapshots = repository.serverHealthSnapshotsFor(principal, limit = 10)

        assertEquals(listOf("signaling", "api"), snapshots.map { it.serviceName })
        assertEquals("degraded", snapshots.first().status)
    }

    @Test
    fun `jdbc operational read repository returns latest stream session state only`() {
        val repository = JdbcOperationalReadRepository(h2DataSource(), emptyList(), emptyMap())
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("co-a"))

        repository.recordStreamSession(
            streamSession(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "online",
                heartbeatAt = timestamp,
            ),
        )
        repository.recordStreamSession(
            streamSession(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "offline",
                heartbeatAt = timestamp.plusSeconds(30),
                stoppedAt = timestamp.plusSeconds(30),
            ),
        )
        repository.recordStreamSession(
            streamSession(
                streamId = "raw.other.front",
                sessionId = "session-2",
                status = "online",
                heartbeatAt = timestamp.plusSeconds(20),
                groupId = GroupId("co-b"),
            ),
        )

        val sessions = repository.streamSessionsFor(principal)

        assertEquals(1, sessions.size)
        assertEquals("raw.mobile.front", sessions.single().streamId)
        assertEquals("offline", sessions.single().status)
        assertEquals(timestamp.plusSeconds(30), sessions.single().lastHeartbeatAt)
    }

    @Test
    fun `latest stream session query uses read view instead of inline anti join`() {
        assertTrue("operational_stream_session_latest" in OperationalReadSql.selectLatestStreamSessions)
        assertFalse("NOT EXISTS" in OperationalReadSql.selectLatestStreamSessions)
    }

    @Test
    fun `jdbc operational read schema creates latest stream session view`() {
        val dataSource = h2DataSource()
        val repository = JdbcOperationalReadRepository(dataSource, emptyList(), emptyMap())
        val jdbc = JdbcTemplate(dataSource)

        repository.recordStreamSession(
            streamSession(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "online",
                heartbeatAt = timestamp,
            ),
        )
        repository.recordStreamSession(
            streamSession(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "offline",
                heartbeatAt = timestamp.plusSeconds(30),
            ),
        )

        val viewCount = jdbc.queryForObject("SELECT COUNT(*) FROM operational_stream_session_latest", Int::class.java)
        val latestStatus = jdbc.queryForObject(
            "SELECT status FROM operational_stream_session_latest WHERE stream_id = ?",
            String::class.java,
            "raw.mobile.front",
        )

        assertEquals(1, viewCount)
        assertEquals("offline", latestStatus)
    }

    private fun telemetry(
        uuid: String,
        groupId: GroupId,
        latitude: Double = 35.8714,
    ): TelemetryReadModel =
        TelemetryReadModel(
            uuid = uuid,
            latitude = latitude,
            longitude = 128.6014,
            altitude = 120.0,
            magneticX = 12.4,
            magneticY = -3.2,
            magneticZ = 42.1,
            soc = "78",
            phoneBatterySOC = 91.0,
            velocity = 8.5,
            totalDistance = 1520.0,
            epochTime = "00:10:23",
            portDistance = 250.0,
            groupId = groupId,
        )

    private fun asset(uuid: String, groupId: GroupId): AssetReadModel =
        AssetReadModel(
            id = 1,
            cid = "A4AI-GCS",
            uuid = uuid,
            companyId = 1,
            type = "drone",
            name = uuid,
            description = null,
            imageUrl = null,
            status = "active",
            createdAt = timestamp,
            updatedAt = timestamp,
            groupId = groupId,
        )

    private fun streamSession(
        streamId: String,
        sessionId: String,
        status: String,
        heartbeatAt: Instant,
        stoppedAt: Instant? = null,
        groupId: GroupId = GroupId("co-a"),
    ): StreamSessionReadModel =
        StreamSessionReadModel(
            streamId = streamId,
            sessionId = sessionId,
            status = status,
            source = "media-control",
            startedAt = timestamp,
            lastHeartbeatAt = heartbeatAt,
            stoppedAt = stoppedAt,
            groupId = groupId,
        )

    private fun h2DataSource(): DriverManagerDataSource =
        DriverManagerDataSource().apply {
            setDriverClassName("org.h2.Driver")
            url = "jdbc:h2:mem:${java.util.UUID.randomUUID()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
            username = "sa"
            password = ""
        }
}
