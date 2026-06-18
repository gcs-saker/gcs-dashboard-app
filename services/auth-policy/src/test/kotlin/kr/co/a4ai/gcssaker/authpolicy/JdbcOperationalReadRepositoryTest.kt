package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import org.junit.jupiter.api.Assertions.assertEquals
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
        repository.upsertTelemetry(telemetry("raw.mobile", GroupId("co-a"), latitude = 35.88))
        val after = repository.telemetryFor(principal)

        assertEquals(listOf("raw.a"), before.map { it.uuid })
        assertTrue(after.any { it.uuid == "raw.mobile" && it.latitude == 35.88 })
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
            WHERE TABLE_NAME IN ('TELEMETRY_LATEST', 'TELEMETRY_HISTORY', 'GATEWAY_ASSETS')
            """.trimIndent(),
            String::class.java,
        ).toSet()

        assertTrue("IX_TELEMETRY_LATEST_GROUP_UUID" in indexes)
        assertTrue("IX_TELEMETRY_HISTORY_UUID_RECORDED" in indexes)
        assertTrue("IX_GATEWAY_ASSETS_GATEWAY_GROUP" in indexes)
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

    private fun h2DataSource(): DriverManagerDataSource =
        DriverManagerDataSource().apply {
            setDriverClassName("org.h2.Driver")
            url = "jdbc:h2:mem:${java.util.UUID.randomUUID()};MODE=MySQL;DB_CLOSE_DELAY=-1"
            username = "sa"
            password = ""
        }
}
