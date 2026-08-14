package kr.co.a4ai.gcssaker.authpolicy.domain

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository

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
    fun `bootstrap accepts field device type alias`() {
        val aliasRepository = InMemoryRegisteredDeviceRepository()
        val aliasService = DeviceBootstrapService(
            lifecycle = DeviceLifecycleService(
                devices = aliasRepository,
                passwordHasher = passwordHasher,
                uuidGenerator = { DeviceBootstrapFixtures.ALIAS_DEVICE_UUID },
            ),
            tokens = DeviceBootstrapTokens.of(
                listOf(DeviceBootstrapToken(DeviceBootstrapFixtures.PROVISIONING_TOKEN, GroupId(DeviceBootstrapFixtures.GROUP_ID))),
            ),
        )

        val issue = aliasService.bootstrap(
            DeviceBootstrapFixtures.command(deviceType = DeviceBootstrapFixtures.UAV_ALIAS),
        )

        assertEquals(DeviceType.DRONE, issue.device.deviceType)
        assertEquals(DeviceType.DRONE, aliasRepository.findByDeviceUuid(DeviceBootstrapFixtures.ALIAS_DEVICE_UUID)?.deviceType)
    }

    @Test
    fun `bootstrap rejects unknown provisioning token before uuid issue`() {
        assertFailsWith<DeviceBootstrapRejectedException> {
            service.bootstrap(DeviceBootstrapFixtures.command(provisioningToken = DeviceBootstrapFixtures.UNKNOWN_TOKEN))
        }

        assertEquals(emptyList(), repository.list())
    }

    @Test
    fun `bootstrap consumes admin issued provisioning token`() {
        val deviceRepository = InMemoryRegisteredDeviceRepository()
        val tokenRepository = InMemoryDeviceProvisioningTokenRepository()
        val tokenService = DeviceProvisioningTokenService(
            repository = tokenRepository,
            passwordHasher = passwordHasher,
            tokenGenerator = DeviceProvisioningTokenGenerator(DeviceBootstrapFixtures.random()),
        )
        val issued = tokenService.issue(DeviceBootstrapFixtures.provisioningCommand())
        val bootstrap = DeviceBootstrapService(
            lifecycle = DeviceLifecycleService(
                devices = deviceRepository,
                passwordHasher = passwordHasher,
                uuidGenerator = { DeviceBootstrapFixtures.DB_TOKEN_DEVICE_UUID },
            ),
            tokens = DeviceBootstrapTokens.empty(),
            provisioningTokens = tokenService,
        )

        bootstrap.bootstrap(DeviceBootstrapFixtures.command(provisioningToken = issued.token))

        assertEquals(DeviceBootstrapFixtures.GROUP_ID, deviceRepository.list().single().groupId.value)
        assertFailsWith<DeviceBootstrapRejectedException> {
            bootstrap.bootstrap(DeviceBootstrapFixtures.command(provisioningToken = issued.token))
        }
    }
}

private object DeviceBootstrapFixtures {
    const val DEVICE_UUID = "00000000-0000-4000-8000-000000000021"
    const val DB_TOKEN_DEVICE_UUID = "00000000-0000-4000-8000-000000000022"
    const val ALIAS_DEVICE_UUID = "00000000-0000-4000-8000-000000000023"
    const val PROVISIONING_TOKEN = "valid-bootstrap-token"
    const val UNKNOWN_TOKEN = "unknown-bootstrap-token"
    const val GROUP_ID = "co-a"
    const val DISPLAY_NAME = "Bootstrap Drone 01"
    const val UAV_ALIAS = "uav"

    fun command(
        provisioningToken: String = PROVISIONING_TOKEN,
        deviceType: String = DeviceType.DRONE.apiValue,
    ): DeviceBootstrapCommand =
        DeviceBootstrapCommand(
            provisioningToken = provisioningToken,
            displayName = DISPLAY_NAME,
            deviceType = deviceType,
            sensors = listOf(RegisteredDeviceSensor(SENSOR_ID, SENSOR_TYPE)),
            streamPaths = listOf(RegisteredDeviceStream(STREAM_PATH)),
        )

    const val SENSOR_ID = "gps-main"
    const val SENSOR_TYPE = "gps"
    const val STREAM_PATH = "raw/daegu/bootstrap-drone-01"

    fun provisioningCommand(): DeviceProvisioningTokenIssueCommand =
        DeviceProvisioningTokenIssueCommand(
            groupId = GROUP_ID,
            label = "Daegu field bootstrap",
            ttlMinutes = 60,
            maxUses = 1,
            createdBy = "admin01",
        )

    fun random(): java.security.SecureRandom =
        java.security.SecureRandom.getInstance("SHA1PRNG").apply { setSeed(17L) }
}
