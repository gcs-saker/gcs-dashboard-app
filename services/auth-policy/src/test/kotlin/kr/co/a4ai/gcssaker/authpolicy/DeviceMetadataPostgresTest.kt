package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class DeviceMetadataPostgresTest {
    private fun source() = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private fun repository() = JdbcRegisteredDeviceRepository(source())
    private fun fixture(uuid: String) = RegisteredDevice(uuid, GroupId("co-a"), "Test", "hash", RegisteredDeviceStatus.ACTIVE,
        sensors = RegisteredDeviceSensors(listOf(RegisteredDeviceSensor("gps", "gps"), RegisteredDeviceSensor("camera", "camera"))),
        streamPaths = RegisteredDeviceStreams(listOf(RegisteredDeviceStream("fixture-path"))))

    @BeforeEach
    fun initialize() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        JdbcOrganizationHierarchyRepository(source(), listOf(OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY)))
        JdbcTemplate(source()).execute("""CREATE TABLE IF NOT EXISTS metadata_mutations (kind VARCHAR PRIMARY KEY, count INT NOT NULL)""")
        JdbcTemplate(source()).execute("""CREATE OR REPLACE FUNCTION count_metadata_mutation() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN INSERT INTO metadata_mutations VALUES (TG_TABLE_NAME, 1) ON CONFLICT (kind)
            DO UPDATE SET count = metadata_mutations.count + 1; RETURN NULL; END; ${'$'}${'$'}""")
        for (table in listOf("registered_device_sensors", "registered_device_streams")) {
            JdbcTemplate(source()).execute("DROP TRIGGER IF EXISTS count_mutations ON $table")
            JdbcTemplate(source()).execute("CREATE TRIGGER count_mutations AFTER INSERT OR UPDATE OR DELETE ON $table FOR EACH ROW EXECUTE FUNCTION count_metadata_mutation()")
        }
    }

    @Test
    fun `unchanged metadata is not rewritten and only one modified sensor is updated`() {
        val devices = repository()
        val original = fixture("unchanged")
        devices.save(original)
        val jdbc = JdbcTemplate(source())
        val before = jdbc.queryForList("SELECT sensor_id, created_at, updated_at FROM registered_device_sensors WHERE device_uuid = 'unchanged' ORDER BY sensor_id")
        jdbc.update("DELETE FROM metadata_mutations")
        devices.save(original.copy(displayName = "Renamed", sensors = RegisteredDeviceSensors(original.sensors.values.reversed())))
        assertEquals(0, jdbc.queryForObject("SELECT COALESCE(SUM(count), 0) FROM metadata_mutations", Int::class.java))
        assertEquals(before, jdbc.queryForList("SELECT sensor_id, created_at, updated_at FROM registered_device_sensors WHERE device_uuid = 'unchanged' ORDER BY sensor_id"))
        devices.save(original.copy(sensors = RegisteredDeviceSensors(listOf(original.sensors.values[0], original.sensors.values[1].copy(status = "inactive")))))
        assertEquals(1, jdbc.queryForObject("SELECT SUM(count) FROM metadata_mutations", Int::class.java))
        assertEquals(2, devices.findByDeviceUuid(original.deviceUuid)?.sensors?.values?.size)
    }

    @Test
    fun `add remove and last removal update only the changed metadata rows`() {
        val devices = repository()
        val original = fixture("delta")
        devices.save(original)
        val jdbc = JdbcTemplate(source())
        jdbc.update("DELETE FROM metadata_mutations")
        val changed = original.copy(sensors = RegisteredDeviceSensors(listOf(original.sensors.values[0], RegisteredDeviceSensor("new", "gps"))),
            streamPaths = RegisteredDeviceStreams.empty())
        devices.save(changed)
        assertEquals(3, jdbc.queryForObject("SELECT SUM(count) FROM metadata_mutations", Int::class.java))
        assertEquals(listOf("gps", "new"), devices.findByDeviceUuid(original.deviceUuid)?.sensors?.values?.map { it.sensorId })
        devices.save(changed.copy(sensors = RegisteredDeviceSensors.empty()))
        assertTrue(devices.findByDeviceUuid(original.deviceUuid)?.sensors?.values.orEmpty().isEmpty())
    }

    @Test
    fun `modified stream attributes update in place without deleting its identity`() {
        val devices = repository()
        val original = fixture("stream-update")
        devices.save(original)
        val jdbc = JdbcTemplate(source())
        val created = jdbc.queryForObject("SELECT created_at FROM registered_device_streams WHERE device_uuid = 'stream-update'", java.sql.Timestamp::class.java)
        jdbc.update("DELETE FROM metadata_mutations")
        devices.save(original.copy(streamPaths = RegisteredDeviceStreams(listOf(original.streamPaths.values.single().copy(kind = "hls", status = "inactive")))))
        assertEquals(1, jdbc.queryForObject("SELECT SUM(count) FROM metadata_mutations", Int::class.java))
        assertEquals(created, jdbc.queryForObject("SELECT created_at FROM registered_device_streams WHERE device_uuid = 'stream-update'", java.sql.Timestamp::class.java))
        assertEquals("hls", devices.findByDeviceUuid(original.deviceUuid)?.streamPaths?.values?.single()?.kind)
    }

    @Test
    fun `invalid metadata rolls back the base device and all delta writes`() {
        val devices = repository()
        val original = fixture("rollback")
        devices.save(original)
        assertThrows<InvalidContractError> {
            devices.save(original.copy(displayName = "Rejected", sensors = RegisteredDeviceSensors(listOf(original.sensors.values[0], original.sensors.values[0]))))
        }
        assertEquals(canonical(original), devices.findByDeviceUuid(original.deviceUuid))
    }

    @Test
    fun `independent writers can upsert the same new identity without duplicate insertion failures`() {
        val writers = listOf(repository(), repository())
        val device = fixture("race")
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures = writers.map { writer -> executor.submit { writer.save(device) } }
            futures.forEach { it.get(5, TimeUnit.SECONDS) }
            assertEquals(canonical(device), writers[0].findByDeviceUuid(device.deviceUuid))
        } finally {
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }

    private fun canonical(device: RegisteredDevice) = device.copy(
        sensors = RegisteredDeviceSensors(device.sensors.values.sortedBy { it.sensorId }),
        streamPaths = RegisteredDeviceStreams(device.streamPaths.values.sortedBy { it.streamPath }),
    )
}
