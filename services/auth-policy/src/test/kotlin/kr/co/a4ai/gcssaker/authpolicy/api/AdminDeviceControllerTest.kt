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

    fun registerRequest(): RegisterDeviceRequest =
        RegisterDeviceRequest(
            groupId = GROUP_ID,
            displayName = "Daegu Drone 01",
        )
}
