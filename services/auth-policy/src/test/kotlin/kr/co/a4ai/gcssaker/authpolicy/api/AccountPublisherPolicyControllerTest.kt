package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Duration

class AccountPublisherPolicyControllerTest {
    private val hasher = PasswordHasher()
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                user("publisher-a", UserRole.OPERATOR),
                user("viewer-a", UserRole.VIEWER),
            ),
        ),
        hasher,
        JwtTokenService("account-publisher-test-secret-32-chars", "test", Duration.ofMinutes(30)),
    )
    private val controller = AccountPublisherPolicyController(
        BearerPrincipalResolver(sessions),
        GroupPolicyService(listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY))),
    )

    @Test
    fun `logged in operator receives server owned group stream identity`() {
        val response = controller.authorize(bearer("publisher-a"), AccountPublishAuthorizationRequest("front"))

        assertEquals("co-a", response.publisherGroupId)
        assertEquals("front", response.sensorId)
        assertEquals(response.streamId.replace('.', '/'), response.path)
        assertEquals("account-publisher-v1", response.policyVersion)
    }

    @Test
    fun `viewer cannot publish`() {
        assertThrows(ForbiddenApiError::class.java) {
            controller.authorize(bearer("viewer-a"), AccountPublishAuthorizationRequest())
        }
    }

    private fun user(username: String, role: UserRole) = AuthUser(
        username = username,
        email = "$username@example.test",
        passwordHash = hasher.hash("password"),
        role = role,
        groupId = GroupId("co-a"),
    )

    private fun bearer(username: String): String {
        val token = sessions.login(username, "password")?.accessToken ?: error("login failed")
        return "${AuthTokenContract.BEARER_PREFIX}$token"
    }
}
