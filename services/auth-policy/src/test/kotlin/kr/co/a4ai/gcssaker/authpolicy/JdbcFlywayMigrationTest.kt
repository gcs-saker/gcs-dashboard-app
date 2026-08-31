package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import org.flywaydb.core.Flyway
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

    @Test
    fun `migration backfills publish metadata for legacy active drones and ugvs`() {
        val dataSource = h2DataSource()
        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .target("13")
            .load()
            .migrate()
        val jdbc = JdbcTemplate(dataSource)
        jdbc.update(
            "INSERT INTO organization_groups (id, name, type) VALUES (?, ?, ?)",
            "co-a",
            "A Company",
            "company",
        )
        insertLegacyDevice(jdbc, "legacy-drone-001", "ACTIVE", "drone")
        insertLegacyDevice(jdbc, "pending-drone-001", "PENDING", "drone")
        insertLegacyDevice(jdbc, "legacy-ugv-001", "ACTIVE", "ugv")
        insertLegacyDevice(jdbc, "pending-ugv-001", "PENDING", "ugv")
        insertLegacyDevice(jdbc, "active-robot-001", "ACTIVE", "robot")

        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate()

        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM registered_device_sensors WHERE device_uuid = ? AND sensor_id = 'front' AND sensor_type = 'camera' AND status = 'active'",
                Int::class.java,
                "legacy-drone-001",
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM registered_device_streams WHERE device_uuid = ? AND stream_path = 'raw/legacy-drone-001/front' AND kind = 'webrtc' AND status = 'active'",
                Int::class.java,
                "legacy-drone-001",
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM registered_device_sensors WHERE device_uuid = ? AND sensor_id = 'front' AND sensor_type = 'camera' AND status = 'active'",
                Int::class.java,
                "legacy-ugv-001",
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM registered_device_streams WHERE device_uuid = ? AND stream_path = 'raw/legacy-ugv-001/front' AND kind = 'webrtc' AND status = 'active'",
                Int::class.java,
                "legacy-ugv-001",
            ),
        )
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM registered_device_sensors WHERE device_uuid IN ('pending-drone-001', 'pending-ugv-001', 'active-robot-001')",
                Int::class.java,
            ),
        )
    }

    private fun insertLegacyDevice(jdbc: JdbcTemplate, deviceUuid: String, status: String, deviceType: String) {
        jdbc.update(
            """
            INSERT INTO registered_devices (device_uuid, group_id, display_name, credential_hash, status, device_type)
            VALUES (?, 'co-a', ?, 'legacy-hash', ?, ?)
            """.trimIndent(),
            deviceUuid,
            deviceUuid,
            status,
            deviceType,
        )
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
