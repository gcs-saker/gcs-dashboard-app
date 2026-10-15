package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.*
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.junit.jupiter.params.provider.CsvSource
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import java.time.Duration

class TelemetryWriteSecurityTest {
    private val hasher = PasswordHasher()
    private val devices = InMemoryRegisteredDeviceRepository()
    private val policy = GroupPolicyService(listOf(
        OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY),
        OrganizationUnit(GroupId("co-b"), "B", GroupType.COMPANY),
        OrganizationUnit(GroupId("co-off"), "Off", GroupType.COMPANY, status = GroupStatus.INACTIVE),
    ))
    private val repository = InMemoryOperationalReadRepository(emptyList(), emptyMap(), devices = devices)
    private val published = mutableListOf<TelemetryReadModel>()
    private val tokens = JwtTokenService("telemetry-security-test-secret-32-chars", "fixture", Duration.ofMinutes(5))
    private val users = InMemoryAuthUserRepository(emptyList())
    private val sessions = AuthSessionService(users, hasher, tokens)
    private val controller = TelemetryWriteController(
        BearerPrincipalResolver(sessions), TelemetryWriteAuthorizationService(policy, devices),
        TelemetryIngestionService(repository, TelemetryIngestionEffects(
            GeofenceTelemetryEvaluator.NOOP, TelemetryAlertRuleEngine.NOOP, TelemetryPublisher { published.add(it) },
        )), DeviceCredentialAuthenticationService(devices, hasher),
    )

    @ParameterizedTest
    @EnumSource(UserRole::class)
    fun `REST write uses existing publish permission rather than authentication alone`(role: UserRole) {
        val bearer = bearer(role)
        if (role == UserRole.OPERATOR || role == UserRole.GROUP_ADMIN) {
            assertEquals("fixture", controller.ingestTelemetry(bearer, TelemetryIngestRequest(uuid = "fixture")).uuid)
            assertEquals(1, published.size)
        } else {
            assertEquals(HttpStatus.FORBIDDEN, assertThrows<ForbiddenApiError> {
                controller.ingestTelemetry(bearer, TelemetryIngestRequest(uuid = "fixture"))
            }.statusCode)
            assertTrue(published.isEmpty())
        }
    }

    @Test
    fun `cross group legacy overwrite cannot change latest history or publisher`() {
        controller.ingestTelemetry(bearer(UserRole.OPERATOR), TelemetryIngestRequest(uuid = "claimed", latitude = 1.0))
        assertThrows<ForbiddenApiError> {
            controller.ingestTelemetry(bearer(UserRole.OPERATOR, "co-b"), TelemetryIngestRequest(uuid = "claimed", latitude = 2.0))
        }
        val owner = AuthenticatedPrincipal("read", UserRole.VIEWER, GroupId("co-a"))
        assertEquals(1.0, repository.telemetryFor(owner).single().latitude)
        assertEquals(1, repository.telemetryHistoryFor(owner, "claimed", 10).size)
        assertEquals(1, published.size)
    }

    @Test
    fun `registered identity cannot be claimed through either bearer route`() {
        devices.save(RegisteredDevice("registered", GroupId("co-b"), "Test", hasher.hash("credential"), RegisteredDeviceStatus.ACTIVE))
        val bearer = bearer(UserRole.OPERATOR)
        assertThrows<ForbiddenApiError> { controller.ingestTelemetry(bearer, TelemetryIngestRequest(uuid = "registered")) }
        assertThrows<ForbiddenApiError> {
            controller.ingestDeviceTelemetry("registered", HttpHeaders().apply { setBearerAuth(bearer.removePrefix("Bearer ")) },
                TelemetryIngestRequest(uuid = null, observedUnixMillis = System.currentTimeMillis()))
        }
        assertTrue(published.isEmpty())
    }

    @Test
    fun `inactive groups and inactive registered devices are denied`() {
        assertThrows<ForbiddenApiError> {
            controller.ingestTelemetry(bearer(UserRole.OPERATOR, "co-off"), TelemetryIngestRequest(uuid = "new"))
        }
        devices.save(RegisteredDevice("inactive", GroupId("co-a"), "Test", "hash", RegisteredDeviceStatus.DISABLED))
        assertThrows<ForbiddenApiError> {
            controller.ingestTelemetry(bearer(UserRole.OPERATOR), TelemetryIngestRequest(uuid = "inactive"))
        }
        assertTrue(published.isEmpty())
    }

    @Test
    fun `valid credential follows approved registered device group move without client changes`() {
        val device = RegisteredDevice("moving", GroupId("co-a"), "Test", hasher.hash("credential"), RegisteredDeviceStatus.ACTIVE)
        devices.save(device)
        val headers = HttpHeaders().apply {
            set(DeviceTelemetryAuthHeaders.DEVICE_UUID, device.deviceUuid)
            set(DeviceTelemetryAuthHeaders.DEVICE_CREDENTIAL, "credential")
        }
        val request = TelemetryIngestRequest(uuid = device.deviceUuid, observedUnixMillis = System.currentTimeMillis())
        controller.ingestDeviceTelemetry(device.deviceUuid, headers, request)
        devices.save(device.copy(groupId = GroupId("co-b")))
        controller.ingestDeviceTelemetry(device.deviceUuid, headers, request)
        assertEquals(listOf(GroupId("co-a"), GroupId("co-b")), published.map { it.groupId })
    }

    @Test
    fun `absent authentication still returns unauthorized and publishes nothing`() {
        assertThrows<UnauthorizedApiError> { controller.ingestTelemetry(null, TelemetryIngestRequest(uuid = "new")) }
        assertTrue(published.isEmpty())
    }

    @ParameterizedTest
    @CsvSource("128,160,true", "129,160,false", "128,161,false")
    fun `identity lengths respect the persistence boundary`(uuidLength: Int, eventLength: Int, allowed: Boolean) {
        val request = TelemetryIngestRequest(uuid = "u".repeat(uuidLength), eventId = "e".repeat(eventLength))
        val bearer = bearer(UserRole.OPERATOR)
        if (allowed) {
            assertEquals(uuidLength, controller.ingestTelemetry(bearer, request).uuid.length)
        } else {
            assertThrows<BadRequestApiError> { controller.ingestTelemetry(bearer, request) }
            assertTrue(published.isEmpty())
        }
    }

    @Test
    fun `storage errors return a stable unavailable response without SQL or private hosts`() {
        val response = ApiExceptionHandler().telemetryStorageError(
            TelemetryStorageUnavailableError(java.sql.SQLException("private-host secret-sql")),
            org.springframework.mock.web.MockHttpServletRequest(),
        )
        assertEquals(503, response.status)
        assertEquals("telemetry storage is unavailable", response.detail)
        assertEquals(TelemetryWriteErrors.STORAGE_UNAVAILABLE, response.properties?.get("code"))
    }

    private fun bearer(role: UserRole, group: String = "co-a"): String {
        val user = AuthUser(username = role.name + group, email = role.name + group + "@example.test",
            passwordHash = "unused", role = role, groupId = GroupId(group))
        users.save(user)
        return "Bearer " + tokens.issueAccessToken(AuthenticatedPrincipal(user.username, role, user.groupId))
    }
}
