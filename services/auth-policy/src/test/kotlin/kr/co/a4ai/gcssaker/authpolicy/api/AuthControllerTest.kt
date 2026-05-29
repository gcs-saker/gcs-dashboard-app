package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.Cookie
import kr.co.a4ai.gcssaker.authpolicy.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AuthControllerTest {
    private val passwordHasher = PasswordHasher()
    private val settings = AuthRuntimeSettings(
        jwtSecret = "test-secret-must-be-at-least-32-characters",
        jwtIssuer = "gcs-saker-test",
        accessTokenExpireMinutes = 30,
        refreshTokenExpireMinutes = 10_080,
        refreshCookieName = "gcs_saker_refresh",
        refreshCookieSecure = false,
        refreshCookieSameSite = "lax",
        allowedOrigins = setOf("http://localhost:18080"),
        operatorUsername = "operator01",
        operatorPassword = "correct-password",
        operatorGroupId = "co-a",
        smokeUsername = "m7-smoke-viewer",
        smokePassword = "m7-smoke-pass",
        smokeGroupId = "co-a",
    )
    private val tokenService = JwtTokenService(
        secret = settings.jwtSecret,
        issuer = settings.jwtIssuer,
        accessTokenTtl = Duration.ofMinutes(settings.accessTokenExpireMinutes),
        refreshTokenTtl = Duration.ofMinutes(settings.refreshTokenExpireMinutes),
    )
    private val controller = AuthController(
        sessions = AuthSessionService(
            users = InMemoryAuthUserRepository(
                listOf(
                    AuthUser(
                        username = "operator01",
                        email = "operator01@example.test",
                        passwordHash = passwordHasher.hash("correct-password"),
                        role = UserRole.OPERATOR,
                        groupId = GroupId("co-a"),
                    ),
                ),
            ),
            passwordHasher = passwordHasher,
            tokenService = tokenService,
        ),
        settings = settings,
    )

    @Test
    fun `login returns python-compatible token response and refresh cookie`() {
        val response = controller.login(
            request = LoginRequest("operator01", "correct-password"),
            origin = "http://localhost:18080",
            referer = null,
        )

        assertEquals(HttpStatus.OK, response.statusCode)
        val body = requireNotNull(response.body)
        assertEquals("bearer", body.tokenType)
        assertEquals(30, body.expiresInMinutes)
        assertEquals("operator01", body.username)
        assertEquals("operator", body.role)
        val cookie = response.headers.getFirst(HttpHeaders.SET_COOKIE)
        assertNotNull(cookie)
        assertTrue(cookie.contains("gcs_saker_refresh="))
        assertTrue(cookie.contains("HttpOnly"))
        assertTrue(cookie.contains("SameSite=lax"))
    }

    @Test
    fun `me verifies bearer access token`() {
        val login = requireNotNull(
            controller.login(LoginRequest("operator01", "correct-password"), "http://localhost:18080", null).body,
        )

        val currentUser = controller.me("Bearer ${login.accessToken}")

        assertEquals(CurrentUserResponse("operator01", "operator"), currentUser)
    }

    @Test
    fun `refresh rotates token from httpOnly cookie`() {
        val loginResponse = controller.login(LoginRequest("operator01", "correct-password"), "http://localhost:18080", null)
        val refreshToken = requireNotNull(loginResponse.headers.getFirst(HttpHeaders.SET_COOKIE))
            .substringAfter("gcs_saker_refresh=")
            .substringBefore(";")
        val servletRequest = MockHttpServletRequest().apply {
            setCookies(Cookie("gcs_saker_refresh", refreshToken))
        }

        val refreshResponse = controller.refresh(servletRequest, "http://localhost:18080", null)

        assertEquals(HttpStatus.OK, refreshResponse.statusCode)
        assertEquals("operator01", requireNotNull(refreshResponse.body).username)
    }

    @Test
    fun `logout clears refresh cookie`() {
        val response = controller.logout("http://localhost:18080", null)

        assertEquals(HttpStatus.NO_CONTENT, response.statusCode)
        assertTrue(requireNotNull(response.headers.getFirst(HttpHeaders.SET_COOKIE)).contains("Max-Age=0"))
    }

    @Test
    fun `mutating auth endpoints reject untrusted origin`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.login(LoginRequest("operator01", "correct-password"), "https://evil.example", null)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `login rejects invalid credentials`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.login(LoginRequest("operator01", "wrong-password"), "http://localhost:18080", null)
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `refresh rejects missing cookie`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.refresh(MockHttpServletRequest(), "http://localhost:18080", null)
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `me rejects missing or invalid bearer token`() {
        val missingError = assertFailsWith<ResponseStatusException> {
            controller.me(null)
        }
        val invalidError = assertFailsWith<ResponseStatusException> {
            controller.me("Bearer not-a-token")
        }

        assertEquals(HttpStatus.UNAUTHORIZED, missingError.statusCode)
        assertEquals(HttpStatus.UNAUTHORIZED, invalidError.statusCode)
    }

    @Test
    fun `trusted referer is accepted when origin header is absent`() {
        val response = controller.login(
            request = LoginRequest("operator01", "correct-password"),
            origin = null,
            referer = "http://localhost:18080/login",
        )

        assertEquals(HttpStatus.OK, response.statusCode)
    }
}
