package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayOutputStream
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
                    role = UserRole.ADMIN,
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
                    eventType = "ice.relay_fallback",
                    sourceService = "turn",
                    streamId = "raw/local/webcam",
                    connectionId = "conn-whep-001",
                    icePath = "relay",
                    relayFallbackReason = "srflx candidate failed",
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
        objectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()),
        streamPolicy = OperationalEventStreamPolicy(pollCount = 1, pollIntervalMillis = 0),
    )

    @Test
    fun `events returns system-wide events to the administrator`() {
        val response = controller.events(bearer(accessToken("viewer-a")), null, null, null, null)

        assertEquals(3, response.size)
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
        assertEquals("ice.relay_fallback", response[0].eventType)
        assertEquals("turn", response[0].sourceService)
        assertEquals("raw/local/webcam", response[0].streamId)
        assertEquals("conn-whep-001", response[0].connectionId)
        assertEquals("relay", response[0].icePath)
        assertEquals("srflx candidate failed", response[0].relayFallbackReason)
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
        val thirdPage = controller.eventPage(
            authorization = token, query = null, severity = null, from = null, to = null,
            limit = 1, after = secondPage.nextCursor,
        )

        assertEquals(listOf("evt-a-warn"), firstPage.events.map { it.id })
        assertEquals(listOf("evt-b-error"), secondPage.events.map { it.id })
        assertEquals(listOf("evt-a-info"), thirdPage.events.map { it.id })
        assertEquals(null, thirdPage.nextCursor)
    }

    @Test
    fun `event stream emits authenticated group events as server sent events`() {
        val response = controller.eventStream(
            authorization = bearer(accessToken("viewer-a")),
            query = null,
            severity = null,
            from = null,
            to = null,
        )
        val output = ByteArrayOutputStream()

        response.body?.writeTo(output)
        val payload = output.toString(Charsets.UTF_8)

        assertEquals(HttpStatus.OK, response.statusCode)
        assertEquals("no", response.headers[OperationalEventStreamContract.HEADER_ACCEL_BUFFERING]?.single())
        assertTrue(payload.contains("event: operational-event"))
        assertTrue(payload.contains("event: heartbeat"))
        assertTrue(payload.contains("\"id\":\"evt-a-warn\""))
        assertTrue(payload.contains("\"id\":\"evt-a-info\""))
        assertTrue(payload.contains("evt-b-error"))
    }

    @Test
    fun `event stream follows bounded watermark batches without full event reads`() {
        val initial = event("evt-initial", "info", "api", "초기", "초기", GroupId("co-a"), 1, 10, 1.0)
        val incremental = event("evt-next", "info", "api", "증분", "증분", GroupId("co-a"), 1, 11, 1.1)
        val tailRepository = TailOnlyOperationalEventRepository(initial, incremental)
        val tailController = OperationalEventController(
            repository = tailRepository,
            principalResolver = BearerPrincipalResolver(sessions),
            objectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()),
            streamPolicy = OperationalEventStreamPolicy(pollCount = 1, pollIntervalMillis = 0),
        )
        val output = ByteArrayOutputStream()

        tailController.eventStream(bearer(accessToken("viewer-a")), null, null, null, null).body?.writeTo(output)

        assertTrue(output.toString(Charsets.UTF_8).contains("evt-initial"))
        assertTrue(output.toString(Charsets.UTF_8).contains("evt-next"))
        assertEquals(OperationalEventStreamContract.BATCH_LIMIT, tailRepository.requestedLimit)
    }

    @Test
    fun `event stream resumes after composite cursor without replaying initial page`() {
        val initial = event("evt-initial", "info", "api", "초기", "초기", GroupId("co-a"), 1, 10, 1.0)
        val incremental = event("evt-next", "info", "api", "증분", "증분", GroupId("co-a"), 1, 11, 1.1)
        val tailRepository = TailOnlyOperationalEventRepository(initial, incremental)
        val tailController = OperationalEventController(
            repository = tailRepository,
            principalResolver = BearerPrincipalResolver(sessions),
            objectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()),
            streamPolicy = OperationalEventStreamPolicy(pollCount = 1, pollIntervalMillis = 0),
        )
        val output = ByteArrayOutputStream()

        tailController.eventStream(
            bearer(accessToken("viewer-a")), null, null, null, null,
            afterOccurredAt = "2026-06-01T00:00:00Z", afterId = "evt-initial",
        ).body?.writeTo(output)

        assertTrue(!output.toString(Charsets.UTF_8).contains("evt-initial"))
        assertTrue(output.toString(Charsets.UTF_8).contains("evt-next"))
        assertEquals(0, tailRepository.initialPageReads)
    }

    @Test
    fun `metrics returns the administrator system-wide aggregate`() {
        val response = controller.metrics(
            authorization = bearer(accessToken("viewer-a")),
            query = null,
            severity = null,
            from = null,
            to = null,
        )

        assertEquals(3, response.totalEvents)
        assertEquals(109, response.totalConnections)
        assertEquals(40, response.minLatencyMs)
        assertEquals(373.0, response.avgLatencyMs)
        assertEquals(999, response.maxLatencyMs)
        assertEquals(343.0, response.avgThroughputMbps)
        assertEquals(listOf("error", "info", "warn"), response.severityCounts.map { it.severity })
        assertEquals(listOf("relay"), response.icePathCounts.map { it.icePath })
        assertEquals(listOf("raw/local/webcam"), response.streamSessions.map { it.streamId })
        assertEquals("conn-whep-001", response.streamSessions.single().connectionId)
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
        assertEquals(2, response[0].eventCount)
        assertEquals(102, response[0].totalConnections)
        assertEquals(519.5, response[0].avgLatencyMs)
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

    @Test
    fun `events reject non administrator accounts`() {
        val error = assertThrows<ResponseStatusException> {
            controller.events(bearer(accessToken("viewer-b")), null, null, null, null)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
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
        eventType: String? = null,
        sourceService: String? = null,
        streamId: String? = null,
        connectionId: String? = null,
        icePath: String? = null,
        relayFallbackReason: String? = null,
    ): OperationalEventReadModel =
        OperationalEventReadModel(
            id = id,
            occurredAt = if (severity == "warn") Instant.parse("2026-06-01T00:10:00Z")
            else Instant.parse("2026-06-01T00:00:00Z"),
            severity = severity,
            category = category,
            eventType = eventType,
            sourceService = sourceService,
            source = source,
            message = message,
            connections = connections,
            latencyMs = latencyMs,
            throughputMbps = throughputMbps,
            groupId = groupId,
            streamId = streamId,
            connectionId = connectionId,
            icePath = icePath,
            relayFallbackReason = relayFallbackReason,
        )

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"
}

private class TailOnlyOperationalEventRepository(
    private val initial: OperationalEventReadModel,
    private val incremental: OperationalEventReadModel,
) : OperationalEventRepository {
    var requestedLimit: Int? = null
    var initialPageReads: Int = 0

    override fun eventsFor(principal: kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal, query: OperationalEventQuery) =
        error("full operational event reads are prohibited for SSE")

    override fun eventPageFor(
        principal: kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal,
        query: OperationalEventPageQuery,
    ): OperationalEventPage {
        initialPageReads += 1
        return OperationalEventPage(listOf(initial), null)
    }

    override fun eventsAfter(
        principal: kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal,
        query: OperationalEventQuery,
        cursor: OperationalEventCursor,
        limit: OperationalEventPageLimit,
    ): List<OperationalEventReadModel> {
        requestedLimit = limit.value
        return listOf(incremental)
    }

    override fun append(event: OperationalEventReadModel) = Unit
}
