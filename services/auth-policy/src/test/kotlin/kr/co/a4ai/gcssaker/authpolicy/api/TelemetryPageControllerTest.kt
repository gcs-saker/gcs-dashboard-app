package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryPageService
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.security.JwtTelemetryCursorCodec
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.time.Duration

class TelemetryPageControllerTest {
    private val secret = "telemetry-page-controller-secret-32-chars"
    private val tokens = JwtTokenService(secret, "fixture", Duration.ofMinutes(5))
    private val users = InMemoryAuthUserRepository(listOf(
        AuthUser(username = "a", email = "a@example.test", passwordHash = "unused", role = UserRole.VIEWER, groupId = GroupId("co-a")),
        AuthUser(username = "b", email = "b@example.test", passwordHash = "unused", role = UserRole.VIEWER, groupId = GroupId("co-b")),
        AuthUser(username = "empty", email = "empty@example.test", passwordHash = "unused", role = UserRole.VIEWER, groupId = GroupId("co-empty")),
    ))
    private var authenticationReads = 0
    private val authoritativeUsers = object : AuthUserRepository by users {
        override fun findByUsername(username: String): AuthUser? {
            authenticationReads += 1
            return users.findByUsername(username)
        }
    }
    private val sessions = AuthSessionService(authoritativeUsers, PasswordHasher(), tokens)
    private val principals = BearerPrincipalResolver(sessions)
    private val repository = InMemoryOperationalReadRepository(listOf(sample("a"), sample("b"), sample("c"), sample("z", "co-b")), emptyMap())
    private val mapper = ObjectMapper().registerKotlinModule()
    private val mvc = MockMvcBuilders.standaloneSetup(
        TelemetryPageController(TelemetryPageService(repository, JwtTelemetryCursorCodec(secret, "fixture"))),
        OperationalReadController(repository, principals),
    ).setControllerAdvice(ApiExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
        .setCustomArgumentResolvers(org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
        .addFilters<org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder>(BearerAuthenticationFilter(sessions, JsonAuthenticationEntryPoint())).build()

    @Test
    fun `new route authenticates once using the request security context`() {
        assertEquals(200, mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("a"))).andReturn().response.status)
        assertEquals(1, authenticationReads)
    }

    @Test
    fun `legacy array and offset remain unchanged while new pages walk without duplicates`() {
        val legacy = mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_ALL).header("Authorization", bearer("a")).param("limit", "2").param("offset", "1")).andReturn().response
        assertEquals(200, legacy.status)
        assertEquals(listOf("b", "c"), mapper.readTree(legacy.contentAsString).map { it["uuid"].asText() })
        val first = page()
        assertEquals(listOf("a", "b"), first["items"].map { it["uuid"].asText() })
        val second = page(cursor = first["nextCursor"].asText())
        assertEquals(listOf("c"), second["items"].map { it["uuid"].asText() })
        assertTrue(second["nextCursor"].isNull)
    }

    @Test
    fun `single item result has no trailing cursor and cannot be cached`() {
        val response = mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("b"))).andReturn().response
        assertEquals(200, response.status)
        assertEquals("no-store", response.getHeader("Cache-Control"))
        assertEquals(listOf("z"), mapper.readTree(response.contentAsString)["items"].map { it["uuid"].asText() })
        assertTrue(mapper.readTree(response.contentAsString)["nextCursor"].isNull)
    }

    @Test
    fun `empty authorized scope returns an empty envelope and no cursor`() {
        val response = mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("empty"))).andReturn().response
        assertEquals(200, response.status)
        assertEquals(0, mapper.readTree(response.contentAsString)["items"].size())
        assertTrue(mapper.readTree(response.contentAsString)["nextCursor"].isNull)
    }

    @ParameterizedTest
    @ValueSource(strings = ["0", "501", "-1", "2147483648", "1.5", "", "NaN"])
    fun `new endpoint rejects invalid limits rather than silently clamping`(limit: String) {
        val response = mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("a")).param("limit", limit)).andReturn().response
        assertEquals(400, response.status)
    }

    @Test
    fun `unknown duplicate offset and malformed cursor parameters are rejected`() {
        val requests = listOf(
            get(OperationalReadApiRoutes.TELEMETRY_PAGE).param("offset", "1"),
            get(OperationalReadApiRoutes.TELEMETRY_PAGE).param("limit", "1", "2"),
            get(OperationalReadApiRoutes.TELEMETRY_PAGE).param("cursor", "", "other"),
            get(OperationalReadApiRoutes.TELEMETRY_PAGE).param("cursor", "private-query-value"),
        )
        requests.forEach { request ->
            val response = mvc.perform(request.header("Authorization", bearer("a"))).andReturn().response
            assertEquals(400, response.status)
            assertFalse(response.contentAsString.contains("private-query-value"))
        }
    }

    @Test
    fun `absent authentication cross identity cursor and stale bearer are denied`() {
        assertEquals(401, mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE)).andReturn().response.status)
        val cursor = page()["nextCursor"].asText()
        assertEquals(403, mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("b")).param("cursor", cursor)).andReturn().response.status)
        val oldBearer = bearer("a")
        val user = requireNotNull(users.findByUsername("a"))
        users.update(user.copy(securityVersion = 2))
        assertEquals(401, mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", oldBearer)).andReturn().response.status)
        assertEquals(403, mvc.perform(get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("a", 2)).param("cursor", cursor)).andReturn().response.status)
    }

    @Test
    fun `values can update during a walk without reordering immutable identity keys`() {
        val cursor = page()["nextCursor"].asText()
        repository.upsertTelemetry(sample("a").copy(latitude = 36.0))
        repository.upsertTelemetry(sample("aa"))
        repository.upsertTelemetry(sample("d"))
        assertEquals(listOf("c", "d"), page(cursor = cursor)["items"].map { it["uuid"].asText() })
        assertEquals(listOf("a", "aa"), page()["items"].map { it["uuid"].asText() })
    }

    private fun page(cursor: String? = null): JsonNode {
        val request = get(OperationalReadApiRoutes.TELEMETRY_PAGE).header("Authorization", bearer("a")).param("limit", "2")
        cursor?.let { request.param("cursor", it) }
        val response = mvc.perform(request).andReturn().response
        assertEquals(200, response.status)
        return mapper.readTree(response.contentAsString)
    }

    private fun bearer(username: String, version: Long = 1) = "Bearer " + tokens.issueAccessToken(
        AuthenticatedPrincipal(username, UserRole.VIEWER, GroupId(when (username) { "a" -> "co-a"; "empty" -> "co-empty"; else -> "co-b" }), version),
    )
    private fun sample(uuid: String, group: String = "co-a") = TelemetryReadModel(
        uuid, 35.0, 128.0, 0.0, 0.0, 0.0, 0.0, "50", 50.0, 0.0, 0.0, "0", 0.0, GroupId(group),
    )
}
