package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class DeviceBootstrapServiceTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val repository = InMemoryRegisteredDeviceRepository()
    private val lifecycle = DeviceLifecycleService(
        devices = repository,
        passwordHasher = passwordHasher,
        uuidGenerator = { DeviceBootstrapFixtures.DEVICE_UUID },
    )
    private val service = DeviceBootstrapService(
        lifecycle = lifecycle,
        tokens = DeviceBootstrapTokens.of(
            listOf(DeviceBootstrapToken(DeviceBootstrapFixtures.PROVISIONING_TOKEN, GroupId(DeviceBootstrapFixtures.GROUP_ID))),
        ),
    )

    @Test
    fun `bootstrap issues server uuid from provisioning token owned group`() {
        val issue = service.bootstrap(DeviceBootstrapFixtures.command())
        val stored = repository.findByDeviceUuid(DeviceBootstrapFixtures.DEVICE_UUID)

        assertEquals(DeviceBootstrapFixtures.DEVICE_UUID, issue.device.deviceUuid)
        assertEquals(DeviceBootstrapFixtures.GROUP_ID, stored?.groupId?.value)
        assertEquals(RegisteredDeviceStatus.PENDING, stored?.status)
        assertNotEquals(issue.credential, stored?.credentialHash)
        assertTrue(passwordHasher.verify(issue.credential, stored?.credentialHash ?: ""))
    }

    @Test
    fun `bootstrap rejects unknown provisioning token before uuid issue`() {
        assertFailsWith<DeviceBootstrapRejectedException> {
            service.bootstrap(DeviceBootstrapFixtures.command(provisioningToken = DeviceBootstrapFixtures.UNKNOWN_TOKEN))
        }

        assertEquals(emptyList(), repository.list())
    }
}

private object DeviceBootstrapFixtures {
    const val DEVICE_UUID = "00000000-0000-4000-8000-000000000021"
    const val PROVISIONING_TOKEN = "valid-bootstrap-token"
    const val UNKNOWN_TOKEN = "unknown-bootstrap-token"
    const val GROUP_ID = "co-a"
    const val DISPLAY_NAME = "Bootstrap Drone 01"

    fun command(provisioningToken: String = PROVISIONING_TOKEN): DeviceBootstrapCommand =
        DeviceBootstrapCommand(
            provisioningToken = provisioningToken,
            displayName = DISPLAY_NAME,
            deviceType = DeviceType.DRONE.apiValue,
            sensors = listOf(RegisteredDeviceSensor(SENSOR_ID, SENSOR_TYPE)),
            streamPaths = listOf(RegisteredDeviceStream(STREAM_PATH)),
        )

    const val SENSOR_ID = "gps-main"
    const val SENSOR_TYPE = "gps"
    const val STREAM_PATH = "raw/daegu/bootstrap-drone-01"
}
