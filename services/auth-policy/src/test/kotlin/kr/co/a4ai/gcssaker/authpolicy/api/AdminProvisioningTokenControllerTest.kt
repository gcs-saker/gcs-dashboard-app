package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenGenerator
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class AdminProvisioningTokenControllerTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val repository = InMemoryDeviceProvisioningTokenRepository()
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                authUser(AdminProvisioningTokenFixtures.ADMIN_USERNAME, UserRole.ADMIN),
                authUser(AdminProvisioningTokenFixtures.VIEWER_USERNAME, UserRole.VIEWER),
            ),
        ),
        passwordHasher,
        JwtTokenService(
            secret = "admin-provisioning-test-secret-32",
            issuer = "gcs-saker-test",
            accessTokenTtl = Duration.ofMinutes(30),
        ),
    )
    private val controller = AdminProvisioningTokenController(
        tokens = DeviceProvisioningTokenService(
            repository = repository,
            passwordHasher = passwordHasher,
            clock = Clock.fixed(AdminProvisioningTokenFixtures.NOW, ZoneOffset.UTC),
            tokenGenerator = DeviceProvisioningTokenGenerator(AdminProvisioningTokenFixtures.random()),
            idGenerator = { AdminProvisioningTokenFixtures.TOKEN_ID },
        ),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `admin issues provisioning token and list never exposes raw token`() {
        val issued = controller.issue(
            authorization = bearer(accessToken(AdminProvisioningTokenFixtures.ADMIN_USERNAME)),
            request = AdminProvisioningTokenFixtures.request(),
        )
        val listed = controller.list(bearer(accessToken(AdminProvisioningTokenFixtures.ADMIN_USERNAME))).single()

        assertEquals(AdminProvisioningTokenFixtures.TOKEN_ID, issued.tokenId)
        assertTrue(issued.token.startsWith("gcs_boot_"))
        assertEquals(AdminProvisioningTokenFixtures.GROUP_ID, issued.groupId)
        assertEquals(AdminProvisioningTokenFixtures.LABEL, listed.label)
        assertFalse(listed.toString().contains(issued.token))
    }

    @Test
    fun `non admin cannot issue provisioning token`() {
        val error = assertThrows<ResponseStatusException> {
            controller.issue(
                authorization = bearer(accessToken(AdminProvisioningTokenFixtures.VIEWER_USERNAME)),
                request = AdminProvisioningTokenFixtures.request(),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    private fun authUser(username: String, role: UserRole): AuthUser =
        AuthUser(
            username = username,
            email = "$username@example.test",
            passwordHash = passwordHasher.hash(AdminProvisioningTokenFixtures.PASSWORD),
            role = role,
            groupId = GroupId(AdminProvisioningTokenFixtures.GROUP_ID),
        )

    private fun accessToken(username: String): String =
        sessions.login(username, AdminProvisioningTokenFixtures.PASSWORD)?.accessToken
            ?: error("login setup failed")

    private fun bearer(accessToken: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$accessToken"
}

private object AdminProvisioningTokenFixtures {
    const val ADMIN_USERNAME = "admin-provisioning"
    const val VIEWER_USERNAME = "viewer-provisioning"
    const val PASSWORD = "pass"
    const val TOKEN_ID = "provisioning-token-001"
    const val GROUP_ID = "co-a"
    const val LABEL = "Daegu field bootstrap"
    val NOW: Instant = Instant.parse("2026-07-20T01:00:00Z")

    fun request(): IssueProvisioningTokenRequest =
        IssueProvisioningTokenRequest(
            groupId = GROUP_ID,
            label = LABEL,
            ttlMinutes = 60,
            maxUses = 1,
        )

    fun random(): java.security.SecureRandom =
        java.security.SecureRandom.getInstance("SHA1PRNG").apply { setSeed(11L) }
}
