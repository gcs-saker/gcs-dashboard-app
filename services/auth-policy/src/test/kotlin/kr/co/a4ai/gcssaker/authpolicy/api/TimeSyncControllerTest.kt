package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryTimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncMode
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.application.RepositorySettingsAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.Instant

class TimeSyncControllerTest {
    private val now = Instant.parse("2026-06-01T01:02:03Z")
    private val passwordHasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "time-sync-test-secret-32-characters",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
    )
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                AuthUser(
                    username = "operator-a",
                    email = "operator-a@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.OPERATOR,
                    groupId = GroupId("co-a"),
                ),
                AuthUser(
                    username = "viewer-a",
                    email = "viewer-a@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.VIEWER,
                    groupId = GroupId("co-a"),
                ),
            ),
        ),
        passwordHasher,
        tokenService,
    )
    private val repository = InMemoryTimeSyncConfigRepository(
        TimeSyncConfig(
            mode = TimeSyncMode.PUBLIC,
            sourceHost = "pool.ntp.org",
            sourcePort = 123,
            driftWarnMs = 1_000,
            updatedAt = Instant.EPOCH,
            updatedBy = "system",
        ),
    )
    private val controller = TimeSyncController(
        repository = repository,
        statusService = TimeSyncStatusService(repository, now = { now }, monotonicMs = { 42_000 }),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `status returns configured time source and server time`() {
        val response = controller.status(bearer(accessToken("viewer-a")))

        assertEquals("public", response.mode)
        assertEquals("pool.ntp.org", response.sourceHost)
        assertEquals(now, response.serverTime)
        assertEquals(42_000, response.monotonicMs)
        assertEquals("UTC", response.timezone)
        assertEquals("ok", response.health)
    }

    @Test
    fun `updateConfig accepts closed network time source for operators`() {
        val response = controller.updateConfig(
            authorization = bearer(accessToken("operator-a")),
            request = TimeSyncConfigRequest(
                mode = "closed_network",
                sourceHost = "10.10.10.10",
                sourcePort = 123,
                driftWarnMs = 500,
            ),
        )

        assertEquals("closed_network", response.mode)
        assertEquals("10.10.10.10", response.sourceHost)
        assertEquals(500, response.driftWarnMs)
        assertEquals("operator-a", response.updatedBy)
    }

    @Test
    fun `updateConfig writes settings audit event for operator changes`() {
        val auditRepository = InMemoryOperationalEventRepository(emptyList())
        val auditedController = TimeSyncController(
            repository = repository,
            statusService = TimeSyncStatusService(repository, now = { now }, monotonicMs = { 42_000 }),
            principalResolver = BearerPrincipalResolver(sessions),
            settingsAuditPublisher = RepositorySettingsAuditPublisher(auditRepository, now = { now }),
        )

        auditedController.updateConfig(
            authorization = bearer(accessToken("operator-a")),
            request = TimeSyncConfigRequest(
                mode = "closed_network",
                sourceHost = "10.10.10.10",
                sourcePort = 123,
                driftWarnMs = 500,
            ),
        )

        val auditEvent = auditRepository.eventsFor(
            sessions.login("operator-a", "pass")!!.principal,
            OperationalEventQuery(query = "time_sync.config.updated"),
        ).single()
        assertEquals("audit", auditEvent.category)
        assertEquals("time_sync.config.updated", auditEvent.eventType)
        assertEquals("auth-policy", auditEvent.sourceService)
        assertEquals("operator-a", auditEvent.message.substringAfter("by "))
    }

    @Test
    fun `updateConfig rejects viewer updates`() {
        val error = assertThrows<ResponseStatusException> {
            controller.updateConfig(
                authorization = bearer(accessToken("viewer-a")),
                request = TimeSyncConfigRequest(mode = "manual"),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `updateConfig rejects closed network mode without source host`() {
        val error = assertThrows<ResponseStatusException> {
            controller.updateConfig(
                authorization = bearer(accessToken("operator-a")),
                request = TimeSyncConfigRequest(mode = "closed_network"),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `check rejects missing bearer token`() {
        val error = assertThrows<ResponseStatusException> {
            controller.check(null)
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"
}
