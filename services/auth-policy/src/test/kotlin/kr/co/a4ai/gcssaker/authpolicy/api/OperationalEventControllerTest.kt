package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.Instant

class OperationalEventControllerTest {
    private val passwordHasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "operational-event-test-secret-32-characters",
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
                    username = "viewer-b",
                    email = "viewer-b@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.VIEWER,
                    groupId = GroupId("co-b"),
                ),
            ),
        ),
        passwordHasher,
        tokenService,
    )
    private val controller = OperationalEventController(
        repository = InMemoryOperationalEventRepository(
            listOf(
                event("evt-a-info", "info", "api", "API 서버", "헬스체크 정상", GroupId("co-a")),
                event("evt-a-warn", "warn", "network", "TURN 릴레이", "직접 ICE 후보 실패", GroupId("co-a")),
                event("evt-b-error", "error", "security", "인증/인가 서버", "다른 그룹 이벤트", GroupId("co-b")),
            ),
        ),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `events returns authenticated group events with operational metrics`() {
        val response = controller.events(bearer(accessToken("viewer-a")), null, null, null, null)

        assertEquals(2, response.size)
        assertTrue(response.all { it.id.startsWith("evt-a") })
        assertTrue(response.any { it.connections == 7 && it.throughputMbps == 12.5 })
    }

    @Test
    fun `events applies severity query and time range filters`() {
        val response = controller.events(
            authorization = bearer(accessToken("viewer-a")),
            query = "ice",
            severity = "warn",
            from = "2026-06-01T00:09:00Z",
            to = "2026-06-01T00:11:00Z",
        )

        assertEquals(1, response.size)
        assertEquals("evt-a-warn", response[0].id)
        assertEquals("TURN 릴레이", response[0].source)
    }

    @Test
    fun `events rejects invalid instant query`() {
        val error = assertThrows<ResponseStatusException> {
            controller.events(bearer(accessToken("viewer-a")), null, null, "not-a-date", null)
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `events reject missing bearer token`() {
        val error = assertThrows<ResponseStatusException> {
            controller.events(null, null, null, null, null)
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    private fun event(
        id: String,
        severity: String,
        category: String,
        source: String,
        message: String,
        groupId: GroupId,
    ): OperationalEventReadModel =
        OperationalEventReadModel(
            id = id,
            occurredAt = if (severity == "warn") Instant.parse("2026-06-01T00:10:00Z")
            else Instant.parse("2026-06-01T00:00:00Z"),
            severity = severity,
            category = category,
            source = source,
            message = message,
            connections = 7,
            latencyMs = 51,
            throughputMbps = 12.5,
            groupId = groupId,
        )

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"
}
