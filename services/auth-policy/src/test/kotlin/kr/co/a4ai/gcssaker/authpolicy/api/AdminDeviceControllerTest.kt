package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceLifecycleService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

class AdminDeviceControllerTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val devices = InMemoryRegisteredDeviceRepository()
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                authUser(AdminDeviceControllerFixtures.ADMIN_USERNAME, UserRole.ADMIN),
                authUser(AdminDeviceControllerFixtures.VIEWER_USERNAME, UserRole.VIEWER),
            ),
        ),
        passwordHasher,
        JwtTokenService(
            secret = "admin-device-test-secret-32-characters",
            issuer = "gcs-saker-test",
            accessTokenTtl = Duration.ofMinutes(30),
        ),
    )
    private val controller = AdminDeviceController(
        lifecycle = DeviceLifecycleService(
            devices = devices,
            passwordHasher = passwordHasher,
            uuidGenerator = { AdminDeviceControllerFixtures.DEVICE_UUID },
        ),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `admin registers pending device and receives credential once`() {
        val response = controller.register(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            request = AdminDeviceControllerFixtures.registerRequest(),
        )
        val stored = devices.findByDeviceUuid(AdminDeviceControllerFixtures.DEVICE_UUID)

        assertEquals(AdminDeviceControllerFixtures.DEVICE_UUID, response.deviceUuid)
        assertEquals(AdminDeviceControllerFixtures.GROUP_ID, response.groupId)
        assertEquals("pending", response.status)
        assertTrue(response.credential.startsWith("gcs_dev_"))
        assertNotEquals(response.credential, stored?.credentialHash)
        assertTrue(passwordHasher.verify(response.credential, stored?.credentialHash ?: ""))
    }

    @Test
    fun `viewer cannot register device`() {
        val error = assertThrows<ResponseStatusException> {
            controller.register(
                authorization = bearer(accessToken(AdminDeviceControllerFixtures.VIEWER_USERNAME)),
                request = AdminDeviceControllerFixtures.registerRequest(),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `admin lists gets and updates registered device without credential exposure`() {
        val registered = controller.register(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            request = AdminDeviceControllerFixtures.registerRequest(),
        )

        val updated = controller.update(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            deviceUuid = registered.deviceUuid,
            request = AdminDeviceControllerFixtures.updateRequest(),
        )
        val listed = controller.list(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
        )
        val found = controller.get(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            deviceUuid = registered.deviceUuid,
        )

        assertEquals(AdminDeviceControllerFixtures.UPDATED_GROUP_ID, updated.groupId)
        assertEquals(AdminDeviceControllerFixtures.UPDATED_DISPLAY_NAME, updated.displayName)
        assertEquals(RegisteredDeviceStatus.ACTIVE.name.lowercase(), updated.status)
        assertEquals(AdminDeviceControllerFixtures.UPDATED_DEVICE_TYPE, updated.deviceType)
        assertEquals(AdminDeviceControllerFixtures.SENSOR_ID, updated.sensors.single().sensorId)
        assertEquals(AdminDeviceControllerFixtures.STREAM_PATH, updated.streamPaths.single().streamPath)
        assertEquals(updated, found)
        assertEquals(listOf(updated), listed)
    }

    @Test
    fun `admin activates disables and rotates credential`() {
        val first = controller.register(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            request = AdminDeviceControllerFixtures.registerRequest(),
        )

        val active = controller.activate(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            deviceUuid = first.deviceUuid,
        )
        val second = controller.rotateCredential(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            deviceUuid = first.deviceUuid,
        )
        val disabled = controller.disable(
            authorization = bearer(accessToken(AdminDeviceControllerFixtures.ADMIN_USERNAME)),
            deviceUuid = first.deviceUuid,
        )

        assertEquals(RegisteredDeviceStatus.ACTIVE.name.lowercase(), active.status)
        assertNotEquals(first.credential, second.credential)
        assertEquals(RegisteredDeviceStatus.DISABLED.name.lowercase(), disabled.status)
    }

    private fun authUser(username: String, role: UserRole): AuthUser =
        AuthUser(
            username = username,
            email = "$username@example.test",
            passwordHash = passwordHasher.hash(AdminDeviceControllerFixtures.PASSWORD),
            role = role,
            groupId = GroupId(AdminDeviceControllerFixtures.GROUP_ID),
        )

    private fun accessToken(username: String): String =
        sessions.login(username, AdminDeviceControllerFixtures.PASSWORD)?.accessToken
            ?: error("login setup failed")

    private fun bearer(accessToken: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$accessToken"
}

private object AdminDeviceControllerFixtures {
    const val ADMIN_USERNAME = "admin-device"
    const val VIEWER_USERNAME = "viewer-device"
    const val PASSWORD = "pass"
    const val DEVICE_UUID = "00000000-0000-4000-8000-000000000002"
    const val GROUP_ID = "co-a"
    const val UPDATED_GROUP_ID = "co-b"
    const val UPDATED_DISPLAY_NAME = "Daegu Drone 01 Updated"
    const val UPDATED_DEVICE_TYPE = "phone"
    const val SENSOR_ID = "gps-main"
    const val STREAM_PATH = "raw/daegu/drone-01"

    fun registerRequest(): RegisterDeviceRequest =
        RegisterDeviceRequest(
            groupId = GROUP_ID,
            displayName = "Daegu Drone 01",
            deviceType = "drone",
            sensors = listOf(DeviceSensorRequest(SENSOR_ID, "gps")),
            streamPaths = listOf(DeviceStreamRequest(STREAM_PATH)),
        )

    fun updateRequest(): UpdateDeviceRequest =
        UpdateDeviceRequest(
            groupId = UPDATED_GROUP_ID,
            displayName = UPDATED_DISPLAY_NAME,
            status = RegisteredDeviceStatus.ACTIVE.name.lowercase(),
            deviceType = UPDATED_DEVICE_TYPE,
            sensors = listOf(DeviceSensorRequest(SENSOR_ID, "camera")),
            streamPaths = listOf(DeviceStreamRequest(STREAM_PATH)),
        )
}
