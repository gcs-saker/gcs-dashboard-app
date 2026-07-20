package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapToken
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapTokens
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class DeviceBootstrapControllerTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val repository = InMemoryRegisteredDeviceRepository()
    private val controller = DeviceBootstrapController(
        DeviceBootstrapService(
            lifecycle = DeviceLifecycleService(
                devices = repository,
                passwordHasher = passwordHasher,
                uuidGenerator = { DeviceBootstrapControllerFixtures.DEVICE_UUID },
            ),
            tokens = DeviceBootstrapTokens.of(
                listOf(
                    DeviceBootstrapToken(
                        token = DeviceBootstrapControllerFixtures.PROVISIONING_TOKEN,
                        groupId = GroupId(DeviceBootstrapControllerFixtures.GROUP_ID),
                    ),
                ),
            ),
        ),
    )

    @Test
    fun `device bootstrap registers pending device and returns credential without group exposure`() {
        val response = controller.register(DeviceBootstrapControllerFixtures.request())
        val stored = repository.findByDeviceUuid(DeviceBootstrapControllerFixtures.DEVICE_UUID)

        assertEquals(DeviceBootstrapControllerFixtures.DEVICE_UUID, response.deviceUuid)
        assertEquals(DeviceBootstrapControllerFixtures.DISPLAY_NAME, response.displayName)
        assertEquals(DeviceBootstrapControllerFixtures.PENDING_STATUS, response.status)
        assertTrue(response.credential.startsWith(DeviceBootstrapControllerFixtures.DEVICE_CREDENTIAL_PREFIX))
        assertNotEquals(response.credential, stored?.credentialHash)
        assertTrue(passwordHasher.verify(response.credential, stored?.credentialHash ?: ""))
        assertFalse(response.toString().contains(DeviceBootstrapControllerFixtures.GROUP_ID))
    }

    @Test
    fun `device bootstrap rejects invalid provisioning token`() {
        val error = assertThrows<ResponseStatusException> {
            controller.register(
                DeviceBootstrapControllerFixtures.request(
                    provisioningToken = DeviceBootstrapControllerFixtures.INVALID_PROVISIONING_TOKEN,
                ),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertTrue(repository.list().isEmpty())
    }
}

private object DeviceBootstrapControllerFixtures {
    const val DEVICE_UUID = "00000000-0000-4000-8000-000000000022"
    const val PROVISIONING_TOKEN = "valid-bootstrap-token"
    const val INVALID_PROVISIONING_TOKEN = "invalid-bootstrap-token"
    const val GROUP_ID = "co-a"
    const val DISPLAY_NAME = "Bootstrap Drone 01"
    const val DEVICE_CREDENTIAL_PREFIX = "gcs_dev_"
    const val PENDING_STATUS = "pending"

    fun request(provisioningToken: String = PROVISIONING_TOKEN): DeviceBootstrapRequest =
        DeviceBootstrapRequest(
            provisioningToken = provisioningToken,
            displayName = DISPLAY_NAME,
            deviceType = "drone",
            sensors = listOf(DeviceSensorRequest(SENSOR_ID, SENSOR_TYPE)),
            streamPaths = listOf(DeviceStreamRequest(STREAM_PATH)),
        )

    const val SENSOR_ID = "gps-main"
    const val SENSOR_TYPE = "gps"
    const val STREAM_PATH = "raw/daegu/bootstrap-drone-01"
}
