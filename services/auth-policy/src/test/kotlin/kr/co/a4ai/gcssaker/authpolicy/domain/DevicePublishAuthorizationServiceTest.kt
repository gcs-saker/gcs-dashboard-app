package kr.co.a4ai.gcssaker.authpolicy.domain

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class DevicePublishAuthorizationServiceTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val activeDevice = RegisteredDevice(
        deviceUuid = DeviceAuthorizationFixtures.DEVICE_UUID,
        groupId = GroupId(DeviceAuthorizationFixtures.GROUP_ID),
        displayName = "Front Drone",
        credentialHash = passwordHasher.hash(DeviceAuthorizationFixtures.CREDENTIAL),
        status = RegisteredDeviceStatus.ACTIVE,
        sensors = RegisteredDeviceSensors(listOf(RegisteredDeviceSensor("front", "camera"))),
    )
    private val service = DevicePublishAuthorizationService(
        devices = InMemoryRegisteredDeviceRepository(listOf(activeDevice)),
        passwordHasher = passwordHasher,
    )

    @Test
    fun `active device is authorized with server owned publisher group`() {
        val authorization = service.authorize(DeviceAuthorizationFixtures.command())

        assertEquals(DeviceAuthorizationFixtures.DEVICE_UUID, authorization.deviceUuid)
        assertEquals(DeviceAuthorizationFixtures.STREAM_ID, authorization.streamId)
        assertEquals(DeviceAuthorizationFixtures.STREAM_PATH, authorization.path)
        assertEquals(DeviceAuthorizationFixtures.GROUP_ID, authorization.publisherGroupId.value)
        assertEquals(DevicePublishAuthorizationReasons.DEVICE_GROUP_AUTHORIZED, authorization.reason)
    }

    @Test
    fun `wrong credential is rejected without exposing group`() {
        val error = assertFailsWith<DevicePublishAuthorizationRejectedException> {
            service.authorize(DeviceAuthorizationFixtures.command(credential = "wrong-secret"))
        }

        assertEquals(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED, error.message)
    }

    @Test
    fun `pending device is rejected before publish authorization`() {
        val pendingService = DevicePublishAuthorizationService(
            devices = InMemoryRegisteredDeviceRepository(
                listOf(activeDevice.copy(status = RegisteredDeviceStatus.PENDING)),
            ),
            passwordHasher = passwordHasher,
        )

        val error = assertFailsWith<DevicePublishAuthorizationRejectedException> {
            pendingService.authorize(DeviceAuthorizationFixtures.command())
        }

        assertEquals(DevicePublishAuthorizationReasons.DEVICE_INACTIVE, error.message)
    }
}

private object DeviceAuthorizationFixtures {
    const val DEVICE_UUID = "device-front-001"
    const val CREDENTIAL = "device-secret"
    const val STREAM_ID = "raw.device-front-001.front"
    const val STREAM_PATH = "raw/device-front-001/front"
    const val GROUP_ID = "co-a"

    fun command(credential: String = CREDENTIAL): DevicePublishAuthorizationCommand =
        DevicePublishAuthorizationCommand(
            deviceUuid = DEVICE_UUID,
            credential = credential,
            sensorId = "front",
        )
}
