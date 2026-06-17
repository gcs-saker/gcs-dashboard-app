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
                event(
                    id = "evt-a-info",
                    severity = "info",
                    category = "api",
                    source = "API 서버",
                    message = "헬스체크 정상",
                    groupId = GroupId("co-a"),
                    connections = 3,
                    latencyMs = 40,
                    throughputMbps = 10.0,
                ),
                event(
                    id = "evt-a-warn",
                    severity = "warn",
                    category = "network",
                    source = "TURN 릴레이",
                    message = "직접 ICE 후보 실패",
                    groupId = GroupId("co-a"),
                    connections = 7,
                    latencyMs = 80,
                    throughputMbps = 20.0,
                ),
                event(
                    id = "evt-b-error",
                    severity = "error",
                    category = "security",
                    source = "인증/인가 서버",
                    message = "다른 그룹 이벤트",
                    groupId = GroupId("co-b"),
                    connections = 99,
                    latencyMs = 999,
                    throughputMbps = 999.0,
                ),
            ),
        ),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `events returns authenticated group events with operational metrics`() {
        val response = controller.events(bearer(accessToken("viewer-a")), null, null, null, null)

        assertEquals(2, response.size)
        assertTrue(response.all { it.id.startsWith("evt-a") })
        assertTrue(response.any { it.connections == 7 && it.throughputMbps == 20.0 })
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
    fun `event page returns keyset cursor and continues without skipping rows`() {
        val token = bearer(accessToken("viewer-a"))
        val firstPage = controller.eventPage(
            authorization = token,
            query = null,
            severity = null,
            from = null,
            to = null,
            limit = 1,
            after = null,
        )
        val secondPage = controller.eventPage(
            authorization = token,
            query = null,
            severity = null,
            from = null,
            to = null,
            limit = 1,
            after = firstPage.nextCursor,
        )

        assertEquals(listOf("evt-a-warn"), firstPage.events.map { it.id })
        assertEquals(listOf("evt-a-info"), secondPage.events.map { it.id })
        assertEquals(null, secondPage.nextCursor)
    }

    @Test
    fun `metrics returns dashboard aggregate without exposing other group events`() {
        val response = controller.metrics(
            authorization = bearer(accessToken("viewer-a")),
            query = null,
            severity = null,
            from = null,
            to = null,
        )

        assertEquals(2, response.totalEvents)
        assertEquals(10, response.totalConnections)
        assertEquals(40, response.minLatencyMs)
        assertEquals(60.0, response.avgLatencyMs)
        assertEquals(80, response.maxLatencyMs)
        assertEquals(15.0, response.avgThroughputMbps)
        assertEquals(listOf("info", "warn"), response.severityCounts.map { it.severity })
    }

    @Test
    fun `buckets returns minute aggregates for dashboard time series`() {
        val response = controller.buckets(
            authorization = bearer(accessToken("viewer-a")),
            query = null,
            severity = null,
            from = null,
            to = null,
        )

        assertEquals(2, response.size)
        assertEquals(Instant.parse("2026-06-01T00:00:00Z"), response[0].bucketStart)
        assertEquals(1, response[0].eventCount)
        assertEquals(3, response[0].totalConnections)
        assertEquals(40.0, response[0].avgLatencyMs)
        assertEquals(Instant.parse("2026-06-01T00:10:00Z"), response[1].bucketStart)
        assertEquals(7, response[1].totalConnections)
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
        connections: Int,
        latencyMs: Long,
        throughputMbps: Double,
    ): OperationalEventReadModel =
        OperationalEventReadModel(
            id = id,
            occurredAt = if (severity == "warn") Instant.parse("2026-06-01T00:10:00Z")
            else Instant.parse("2026-06-01T00:00:00Z"),
            severity = severity,
            category = category,
            source = source,
            message = message,
            connections = connections,
            latencyMs = latencyMs,
            throughputMbps = throughputMbps,
            groupId = groupId,
        )

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"
}
