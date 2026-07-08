package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class DeviceLifecycleServiceTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val repository = InMemoryRegisteredDeviceRepository()
    private val service = DeviceLifecycleService(
        devices = repository,
        passwordHasher = passwordHasher,
        uuidGenerator = { DeviceLifecycleFixtures.DEVICE_UUID },
    )

    @Test
    fun `register issues server uuid and stores credential hash only`() {
        val issue = service.register(DeviceLifecycleFixtures.registerCommand())
        val stored = repository.findByDeviceUuid(DeviceLifecycleFixtures.DEVICE_UUID)

        assertEquals(DeviceLifecycleFixtures.DEVICE_UUID, issue.device.deviceUuid)
        assertEquals(RegisteredDeviceStatus.PENDING, issue.device.status)
        assertTrue(issue.credential.startsWith(DeviceCredentialContract.PREFIX))
        assertEquals(DeviceLifecycleFixtures.GROUP_ID, stored?.groupId?.value)
        assertNotEquals(issue.credential, stored?.credentialHash)
        assertTrue(passwordHasher.verify(issue.credential, stored?.credentialHash ?: ""))
    }

    @Test
    fun `activate and disable change device status`() {
        service.register(DeviceLifecycleFixtures.registerCommand())

        assertEquals(RegisteredDeviceStatus.ACTIVE, service.activate(DeviceLifecycleFixtures.DEVICE_UUID).status)
        assertEquals(RegisteredDeviceStatus.DISABLED, service.disable(DeviceLifecycleFixtures.DEVICE_UUID).status)
    }

    @Test
    fun `rotate credential returns new secret and replaces stored hash`() {
        val firstIssue = service.register(DeviceLifecycleFixtures.registerCommand())
        val firstHash = repository.findByDeviceUuid(DeviceLifecycleFixtures.DEVICE_UUID)?.credentialHash

        val secondIssue = service.rotateCredential(DeviceLifecycleFixtures.DEVICE_UUID)
        val secondHash = repository.findByDeviceUuid(DeviceLifecycleFixtures.DEVICE_UUID)?.credentialHash

        assertNotEquals(firstIssue.credential, secondIssue.credential)
        assertNotEquals(firstHash, secondHash)
        assertTrue(passwordHasher.verify(secondIssue.credential, secondHash ?: ""))
    }

    @Test
    fun `unknown device lifecycle command fails closed`() {
        assertFailsWith<DeviceNotFoundException> {
            service.activate(DeviceLifecycleFixtures.DEVICE_UUID)
        }
    }

    @Test
    fun `register retries when generated uuid already exists`() {
        val existingUuid = "00000000-0000-4000-8000-000000000010"
        val nextUuid = "00000000-0000-4000-8000-000000000011"
        val retryRepository = InMemoryRegisteredDeviceRepository(
            listOf(
                RegisteredDevice(
                    deviceUuid = existingUuid,
                    groupId = GroupId(DeviceLifecycleFixtures.GROUP_ID),
                    displayName = "Existing Device",
                    credentialHash = passwordHasher.hash("existing-secret"),
                    status = RegisteredDeviceStatus.ACTIVE,
                ),
            ),
        )
        val uuids = ArrayDeque(listOf(existingUuid, nextUuid))
        val retryService = DeviceLifecycleService(
            devices = retryRepository,
            passwordHasher = passwordHasher,
            uuidGenerator = { uuids.removeFirst() },
        )

        val issue = retryService.register(DeviceLifecycleFixtures.registerCommand())

        assertEquals(nextUuid, issue.device.deviceUuid)
    }
}

private object DeviceLifecycleFixtures {
    const val DEVICE_UUID = "00000000-0000-4000-8000-000000000001"
    const val GROUP_ID = "co-a"
    const val DISPLAY_NAME = "Daegu Drone 01"

    fun registerCommand(): RegisterDeviceCommand =
        RegisterDeviceCommand(
            groupId = GROUP_ID,
            displayName = DISPLAY_NAME,
        )
}
