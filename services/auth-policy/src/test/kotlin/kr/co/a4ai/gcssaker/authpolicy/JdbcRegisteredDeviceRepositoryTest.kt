package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceType
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensor
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensors
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStream
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStreams
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcRegisteredDeviceRepository
import org.h2.jdbcx.JdbcDataSource
import org.springframework.jdbc.core.JdbcTemplate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class JdbcRegisteredDeviceRepositoryTest {
    @Test
    fun `legacy inactive status maps to disabled during rolling deployment`() {
        assertEquals(RegisteredDeviceStatus.DISABLED, RegisteredDeviceStatus.fromPersistence("INACTIVE"))
        assertEquals(RegisteredDeviceStatus.ACTIVE, RegisteredDeviceStatus.fromPersistence("active"))
    }

    @Test
    fun `jdbc repository maps legacy ground robot device type`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)
        JdbcTemplate(dataSource).update(
            """
            INSERT INTO registered_devices
                (device_uuid, group_id, display_name, credential_hash, status, device_type)
            VALUES (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            DeviceRepositoryFixtures.DEVICE_UUID,
            "co-a",
            "Legacy Ground Robot",
            DeviceRepositoryFixtures.CREDENTIAL_HASH,
            "active",
            "ground_robot",
        )

        val saved = repository.findByDeviceUuid(DeviceRepositoryFixtures.DEVICE_UUID)

        assertEquals(DeviceType.ROBOT, saved?.deviceType)
    }

    @Test
    fun `jdbc repository stores registered device credential hash and group`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)

        repository.save(DeviceRepositoryFixtures.device(DeviceRepositoryFixtures.DEVICE_UUID))

        val saved = repository.findByDeviceUuid(DeviceRepositoryFixtures.DEVICE_UUID)
        assertEquals(DeviceRepositoryFixtures.DEVICE_UUID, saved?.deviceUuid)
        assertEquals("co-a", saved?.groupId?.value)
        assertEquals(DeviceRepositoryFixtures.CREDENTIAL_HASH, saved?.credentialHash)
        assertEquals(RegisteredDeviceStatus.ACTIVE, saved?.status)
        assertEquals(DeviceRepositoryFixtures.SENSOR_ID, saved?.sensors?.values?.single()?.sensorId)
        assertEquals(DeviceRepositoryFixtures.STREAM_PATH, saved?.streamPaths?.values?.single()?.streamPath)
    }

    @Test
    fun `jdbc repository updates registered device lifecycle fields`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)

        repository.save(
            RegisteredDevice(
                deviceUuid = DeviceRepositoryFixtures.DEVICE_UUID,
                groupId = GroupId("co-a"),
                displayName = "Front Drone",
                credentialHash = DeviceRepositoryFixtures.CREDENTIAL_HASH,
                status = RegisteredDeviceStatus.PENDING,
            ),
        )
        repository.save(
            RegisteredDevice(
                deviceUuid = DeviceRepositoryFixtures.DEVICE_UUID,
                groupId = GroupId("co-a"),
                displayName = "Front Drone Updated",
                credentialHash = DeviceRepositoryFixtures.ROTATED_CREDENTIAL_HASH,
                status = RegisteredDeviceStatus.DISABLED,
            ),
        )

        val saved = repository.findByDeviceUuid(DeviceRepositoryFixtures.DEVICE_UUID)
        assertEquals("Front Drone Updated", saved?.displayName)
        assertEquals(DeviceRepositoryFixtures.ROTATED_CREDENTIAL_HASH, saved?.credentialHash)
        assertEquals(RegisteredDeviceStatus.DISABLED, saved?.status)
    }

    @Test
    fun `jdbc repository lists registered devices without credential loss`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)

        repository.save(DeviceRepositoryFixtures.device(DeviceRepositoryFixtures.DEVICE_UUID_B))
        repository.save(DeviceRepositoryFixtures.device(DeviceRepositoryFixtures.DEVICE_UUID_A))

        val devices = repository.list()

        assertEquals(listOf(DeviceRepositoryFixtures.DEVICE_UUID_A, DeviceRepositoryFixtures.DEVICE_UUID_B), devices.map { it.deviceUuid })
        assertEquals(DeviceRepositoryFixtures.CREDENTIAL_HASH, devices.first().credentialHash)
        assertEquals(DeviceRepositoryFixtures.SENSOR_ID, devices.first().sensors.values.single().sensorId)
    }

    @Test
    fun `metadata write failure rolls back the device row update`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource, listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)
        val original = DeviceRepositoryFixtures.device(DeviceRepositoryFixtures.DEVICE_UUID)
        repository.save(original)
        JdbcTemplate(dataSource).execute(
            "ALTER TABLE registered_device_streams ADD CONSTRAINT reject_blocked_stream CHECK (stream_path <> 'blocked')",
        )

        assertFails {
            repository.save(
                original.copy(
                    displayName = "Must Roll Back",
                    streamPaths = RegisteredDeviceStreams(listOf(RegisteredDeviceStream("blocked"))),
                ),
            )
        }

        val stored = repository.findByDeviceUuid(DeviceRepositoryFixtures.DEVICE_UUID)
        assertEquals(original.displayName, stored?.displayName)
        assertEquals(DeviceRepositoryFixtures.STREAM_PATH, stored?.streamPaths?.values?.single()?.streamPath)
    }

    private fun h2DataSource(): JdbcDataSource =
        JdbcDataSource().apply {
            setURL("jdbc:h2:mem:registered_device_${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
            user = "sa"
            password = ""
        }
}

private object DeviceRepositoryFixtures {
    const val DEVICE_UUID_A = "device-front-001"
    const val DEVICE_UUID_B = "device-front-002"
    const val DEVICE_UUID = "device-front-001"
    const val CREDENTIAL_HASH = "credential-hash"
    const val ROTATED_CREDENTIAL_HASH = "rotated-credential-hash"
    const val SENSOR_ID = "gps-main"
    const val STREAM_PATH = "raw/daegu/device-front-001"

    fun device(deviceUuid: String): RegisteredDevice =
        RegisteredDevice(
            deviceUuid = deviceUuid,
            groupId = GroupId("co-a"),
            displayName = "Front Drone",
            credentialHash = CREDENTIAL_HASH,
            status = RegisteredDeviceStatus.ACTIVE,
            sensors = RegisteredDeviceSensors(listOf(RegisteredDeviceSensor(SENSOR_ID, "gps"))),
            streamPaths = RegisteredDeviceStreams(listOf(RegisteredDeviceStream(STREAM_PATH))),
        )
}
