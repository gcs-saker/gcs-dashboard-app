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
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

class StreamPolicyControllerTest {
    private val passwordHasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "stream-policy-test-secret-32-characters",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
    )
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                AuthUser(
                    username = "viewer-a",
                    email = "viewer-a@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.VIEWER,
                    groupId = GroupId("co-a"),
                ),
                AuthUser(
                    username = "operator-bn",
                    email = "operator@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.OPERATOR,
                    groupId = GroupId("bn-1"),
                ),
                AuthUser(
                    username = "group-admin-bn",
                    email = "group-admin@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.GROUP_ADMIN,
                    groupId = GroupId("bn-1"),
                ),
            ),
        ),
        passwordHasher,
        tokenService,
    )
    private val controller = StreamPolicyController(
        BearerPrincipalResolver(sessions),
        GroupPolicyService(
            listOf(
                OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION),
                OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
                OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, GroupId("bn-1")),
            ),
        ),
    )

    @Test
    fun `same group viewer can access stream`() {
        val token = accessToken("viewer-a")

        val response = controller.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.sample.front",
                path = "raw/sample/front",
                publisherGroupId = "co-a",
            ),
        )

        assertTrue(response.allowed)
        assertEquals("same group stream", response.reason)
        assertEquals("viewer-a", response.principalId)
        assertEquals("co-a", response.groupId)
        assertEquals(StreamPolicyDecisionContract.POLICY_VERSION, response.policyVersion)
        assertEquals("viewer-a:co-a:viewer", response.principalVersion)
        assertEquals(listOf("view_stream"), response.permissions)
    }

    @Test
    fun `viewer outside group receives deny decision`() {
        val token = accessToken("viewer-a")

        val response = controller.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.company-b.front",
                path = "raw/company-b/front",
                publisherGroupId = "co-b",
            ),
        )

        assertFalse(response.allowed)
        assertEquals("stream is outside principal group scope", response.reason)
    }

    @Test
    fun `group admin can access descendant group stream`() {
        val token = accessToken("group-admin-bn")

        val response = controller.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.company-b.front",
                path = "raw/company-b/front",
                publisherGroupId = "co-b",
            ),
        )

        assertTrue(response.allowed)
        assertEquals("group admin can view descendant group stream", response.reason)
    }

    @Test
    fun `operator cannot access descendant group stream`() {
        val token = accessToken("operator-bn")

        val response = controller.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.company-b.front",
                path = "raw/company-b/front",
                publisherGroupId = "co-b",
            ),
        )

        assertFalse(response.allowed)
    }

    @Test
    fun `missing token is rejected`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.access(
                null,
                StreamAccessRequest(
                    streamId = "raw.sample.front",
                    path = "raw/sample/front",
                    publisherGroupId = "co-a",
                ),
            )
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `stream access decision publishes allow and deny audit events`() {
        val audit = RecordingSecurityAuditPublisher()
        val auditedController = StreamPolicyController(
            BearerPrincipalResolver(sessions),
            GroupPolicyService(
                listOf(
                    OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION),
                    OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
                    OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, GroupId("bn-1")),
                ),
            ),
            audit,
        )
        val token = accessToken("viewer-a")

        auditedController.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.sample.front",
                path = "raw/sample/front",
                publisherGroupId = "co-a",
            ),
        )
        auditedController.access(
            bearer(token),
            StreamAccessRequest(
                streamId = "raw.company-b.front",
                path = "raw/company-b/front",
                publisherGroupId = "co-b",
            ),
        )

        assertEquals(
            listOf(
                "raw.sample.front:co-a:true:same group stream",
                "raw.company-b.front:co-b:false:stream is outside principal group scope",
            ),
            audit.events,
        )
    }

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"

    private class RecordingSecurityAuditPublisher : SecurityAuditPublisher {
        val events = mutableListOf<String>()

        override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) = Unit

        override fun publishLoginFailed(username: String) = Unit

        override fun publishLogout(principal: AuthenticatedPrincipal?) = Unit

        override fun publishRefreshFailed(reason: String) = Unit

        override fun publishStreamAccess(
            principal: AuthenticatedPrincipal,
            streamId: String,
            publisherGroupId: GroupId,
            allowed: Boolean,
            reason: String,
        ) {
            events.add("$streamId:${publisherGroupId.value}:$allowed:$reason")
        }
    }
}
