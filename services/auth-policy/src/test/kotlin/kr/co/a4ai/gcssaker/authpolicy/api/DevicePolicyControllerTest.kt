package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensor
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensors
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import kotlin.test.assertFailsWith

class DevicePolicyControllerTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val controller = DevicePolicyController(
        DevicePublishAuthorizationService(
            devices = InMemoryRegisteredDeviceRepository(
                listOf(
                    RegisteredDevice(
                        deviceUuid = DevicePolicyFixtures.DEVICE_UUID,
                        groupId = GroupId(DevicePolicyFixtures.GROUP_ID),
                        displayName = "Front Drone",
                        credentialHash = passwordHasher.hash(DevicePolicyFixtures.CREDENTIAL),
                        status = RegisteredDeviceStatus.ACTIVE,
                        sensors = RegisteredDeviceSensors(listOf(RegisteredDeviceSensor("front", "camera"))),
                    ),
                ),
            ),
            passwordHasher = passwordHasher,
        ),
    )

    @Test
    fun `device publish authorization returns server owned group without group in request`() {
        val response = controller.publishAuthorization(DevicePolicyFixtures.request())

        assertEquals(DevicePolicyFixtures.DEVICE_UUID, response.deviceUuid)
        assertEquals(DevicePolicyFixtures.STREAM_ID, response.streamId)
        assertEquals(DevicePolicyFixtures.STREAM_PATH, response.path)
        assertEquals(DevicePolicyFixtures.GROUP_ID, response.publisherGroupId)
        assertEquals(DevicePolicyDecisionContract.POLICY_VERSION, response.policyVersion)
    }

    @Test
    fun `wrong device credential is forbidden`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.publishAuthorization(DevicePolicyFixtures.request(credential = "wrong-secret"))
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }
}

private object DevicePolicyFixtures {
    const val DEVICE_UUID = "device-front-001"
    const val CREDENTIAL = "device-secret"
    const val STREAM_ID = "raw.device-front-001.front"
    const val STREAM_PATH = "raw/device-front-001/front"
    const val GROUP_ID = "co-a"

    fun request(credential: String = CREDENTIAL): DevicePublishAuthorizationRequest =
        DevicePublishAuthorizationRequest(
            deviceUuid = DEVICE_UUID,
            credential = credential,
            sensorId = "front",
        )
}
