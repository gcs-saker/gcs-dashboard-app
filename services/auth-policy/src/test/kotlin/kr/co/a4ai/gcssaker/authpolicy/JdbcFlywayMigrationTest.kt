package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource

class JdbcFlywayMigrationTest {
    @Test
    fun `repository initialization applies versioned flyway migration on empty database`() {
        val dataSource = h2DataSource()

        JdbcOperationalReadRepository(
            dataSource = dataSource,
            telemetry = listOf(telemetry("raw.flyway")),
            assetsByGateway = emptyMap(),
        )

        val jdbc = JdbcTemplate(dataSource)
        val installedRank = jdbc.queryForObject(
            "SELECT \"installed_rank\" FROM \"flyway_schema_history\" WHERE \"version\" = ? AND \"success\" = TRUE",
            Int::class.java,
            "1",
        )
        val relationCount = jdbc.queryForObject(
            """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME IN (
                'AUTH_USERS',
                'OPERATIONAL_EVENTS',
                'TELEMETRY_LATEST',
                'TELEMETRY_HISTORY',
                'GATEWAY_ASSETS',
                'SERVER_HEALTH_SNAPSHOTS',
                'STREAM_SESSIONS',
                'OPERATIONAL_STREAM_SESSION_LATEST'
            )
            """.trimIndent(),
            Int::class.java,
        )
        val latestViewVersion = jdbc.queryForObject(
            "SELECT \"installed_rank\" FROM \"flyway_schema_history\" WHERE \"version\" = ? AND \"success\" = TRUE",
            Int::class.java,
            "4",
        )
        val geometryMigration = jdbc.queryForObject(
            "SELECT \"installed_rank\" FROM \"flyway_schema_history\" WHERE \"version\" = ? AND \"success\" = TRUE",
            Int::class.java,
            "7",
        )

        assertEquals(1, installedRank)
        assertEquals(4, latestViewVersion)
        assertEquals(7, geometryMigration)
        assertEquals(8, relationCount)
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM telemetry_latest", Int::class.java)!! > 0)
    }

    private fun h2DataSource(): DriverManagerDataSource =
        DriverManagerDataSource().apply {
            setDriverClassName("org.h2.Driver")
            url = "jdbc:h2:mem:${java.util.UUID.randomUUID()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
            username = "sa"
            password = ""
        }

    private fun telemetry(uuid: String): TelemetryReadModel =
        TelemetryReadModel(
            uuid = uuid,
            latitude = 35.8714,
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
            groupId = GroupId("co-a"),
        )
}
