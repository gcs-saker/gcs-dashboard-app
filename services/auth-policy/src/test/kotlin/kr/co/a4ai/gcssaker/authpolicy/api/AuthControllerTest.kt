package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.Cookie
import kr.co.a4ai.gcssaker.authpolicy.configuration.AllowedOrigins
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvite
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
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
    private companion object {
        const val TRUSTED_ORIGIN = "http://localhost:18080"
        const val TRUSTED_LOGIN_REFERER = "$TRUSTED_ORIGIN/login"
        const val MALFORMED_REFERER = "http://%"
        const val UNTRUSTED_ORIGIN = "https://evil.example"
        const val OPERATOR_USERNAME = "operator01"
        const val OPERATOR_PASSWORD = "correct-password"
        const val VIEWER_INVITE_CODE = "A4AI01"
        const val REFRESH_COOKIE_NAME = "gcs_saker_refresh"
    }

    private val passwordHasher = PasswordHasher()
    private val settings = AuthRuntimeSettings(
        jwtSecret = "test-secret-must-be-at-least-32-characters",
        jwtIssuer = "gcs-saker-test",
        accessTokenExpireMinutes = 30,
        refreshTokenExpireMinutes = 10_080,
        refreshCookieName = REFRESH_COOKIE_NAME,
        refreshCookieSecure = false,
        refreshCookieSameSite = "lax",
        allowedOrigins = AllowedOrigins.of(setOf(TRUSTED_ORIGIN)),
        adminUsername = "admin01",
        adminPassword = "admin-password",
        adminCompanyId = 1,
        adminGroupId = "bn-1",
        operatorUsername = OPERATOR_USERNAME,
        operatorPassword = OPERATOR_PASSWORD,
        operatorCompanyId = 1,
        operatorGroupId = "co-a",
        smokeUsername = "m7-smoke-viewer",
        smokePassword = "m7-smoke-pass",
        smokeCompanyId = 1,
        smokeGroupId = "co-a",
        signupInvites = SignupInvites.of(listOf(SignupInvite(VIEWER_INVITE_CODE, 1, GroupId("co-a")))),
    )
    private val tokenService = JwtTokenService(
        secret = settings.jwtSecret,
        issuer = settings.jwtIssuer,
        accessTokenTtl = Duration.ofMinutes(settings.accessTokenExpireMinutes),
        refreshTokenTtl = Duration.ofMinutes(settings.refreshTokenExpireMinutes),
    )
    private val users = InMemoryAuthUserRepository(
                listOf(
                    AuthUser(
                        id = 1,
                        username = OPERATOR_USERNAME,
                        email = "operator01@example.test",
                        passwordHash = passwordHasher.hash(OPERATOR_PASSWORD),
                        companyId = 1,
                        role = UserRole.OPERATOR,
                        groupId = GroupId("co-a"),
                    ),
                ),
            )

    private val controller = AuthController(
        sessions = AuthSessionService(
            users = users,
            passwordHasher = passwordHasher,
            tokenService = tokenService,
        ),
        registration = AuthRegistrationService(users, passwordHasher, settings.signupInvites),
        settings = settings,
    )

    private fun login(
        request: LoginRequest = LoginRequest(OPERATOR_USERNAME, OPERATOR_PASSWORD),
        origin: String? = TRUSTED_ORIGIN,
        referer: String? = null,
        csrfHeader: String? = AuthSecurityHeaders.CSRF_HEADER_VALUE,
    ) = controller.login(request, origin, referer, csrfHeader)

    private fun signup(
        request: SignupRequest,
        origin: String? = TRUSTED_ORIGIN,
        referer: String? = null,
        csrfHeader: String? = AuthSecurityHeaders.CSRF_HEADER_VALUE,
    ) = controller.signup(request, origin, referer, csrfHeader)

    private fun refresh(
        request: MockHttpServletRequest,
        origin: String? = TRUSTED_ORIGIN,
        referer: String? = null,
        csrfHeader: String? = AuthSecurityHeaders.CSRF_HEADER_VALUE,
    ) = controller.refresh(request, origin, referer, csrfHeader)

    private fun logout(
        request: MockHttpServletRequest = MockHttpServletRequest(),
        authorization: String? = null,
        origin: String? = TRUSTED_ORIGIN,
        referer: String? = null,
        csrfHeader: String? = AuthSecurityHeaders.CSRF_HEADER_VALUE,
    ) = controller.logout(request, authorization, origin, referer, csrfHeader)

    @Test
    fun `login returns python-compatible token response and refresh cookie`() {
        val response = login()

        assertEquals(HttpStatus.OK, response.statusCode)
        val body = requireNotNull(response.body)
        assertEquals(AuthTokenContract.BEARER_TOKEN_TYPE, body.tokenType)
        assertEquals(30, body.expiresInMinutes)
        assertEquals(OPERATOR_USERNAME, body.username)
        assertEquals("operator", body.role)
        val cookie = response.headers.getFirst(HttpHeaders.SET_COOKIE)
        assertNotNull(cookie)
        assertTrue(cookie.contains("$REFRESH_COOKIE_NAME="))
        assertTrue(cookie.contains("HttpOnly"))
        assertTrue(cookie.contains("SameSite=lax"))
        assertEquals("no-store", response.headers.cacheControl)
        assertEquals(AuthResponseHeaders.PRAGMA_NO_CACHE, response.headers.getFirst(AuthResponseHeaders.PRAGMA_HEADER_NAME))
    }

    @Test
    fun `signup creates python-compatible user response without password fields`() {
        val response = signup(
            request = SignupRequest(
                username = "viewer02",
                email = "viewer02@example.test",
                password = "strong-password",
                inviteCode = VIEWER_INVITE_CODE,
            )
        )

        assertEquals(HttpStatus.CREATED, response.statusCode)
        assertEquals(
            UserResponse(
                id = 2,
                username = "viewer02",
                email = "viewer02@example.test",
                companyId = 1,
                role = "viewer",
            ),
            response.body,
        )

        val login = login(LoginRequest("viewer02", "strong-password"))
        assertEquals(HttpStatus.OK, login.statusCode)
    }

    @Test
    fun `signup rejects duplicate username email and invalid invite code`() {
        val duplicateUsername = assertFailsWith<ResponseStatusException> {
            signup(
                SignupRequest(
                    username = OPERATOR_USERNAME,
                    email = "new@example.test",
                    password = "strong-password",
                    inviteCode = VIEWER_INVITE_CODE,
                )
            )
        }
        val duplicateEmail = assertFailsWith<ResponseStatusException> {
            signup(
                SignupRequest(
                    username = "viewer03",
                    email = "operator01@example.test",
                    password = "strong-password",
                    inviteCode = VIEWER_INVITE_CODE,
                )
            )
        }
        val invalidInvite = assertFailsWith<ResponseStatusException> {
            signup(
                SignupRequest(
                    username = "viewer04",
                    email = "viewer04@example.test",
                    password = "strong-password",
                    inviteCode = "WRONG",
                )
            )
        }

        assertEquals(HttpStatus.CONFLICT, duplicateUsername.statusCode)
        assertEquals("Username already registered", duplicateUsername.reason)
        assertEquals(HttpStatus.CONFLICT, duplicateEmail.statusCode)
        assertEquals("Email already registered", duplicateEmail.reason)
        assertEquals(HttpStatus.BAD_REQUEST, invalidInvite.statusCode)
        assertEquals("Invalid invite code Input", invalidInvite.reason)
    }

    @Test
    fun `me verifies bearer access token`() {
        val login = requireNotNull(
            login().body,
        )

        val currentUser = controller.me("${AuthTokenContract.BEARER_PREFIX}${login.accessToken}")

        assertEquals(CurrentUserResponse("operator01", "operator"), currentUser)
    }

    @Test
    fun `refresh rotates token from httpOnly cookie`() {
        val loginResponse = login()
        val refreshToken = requireNotNull(loginResponse.headers.getFirst(HttpHeaders.SET_COOKIE))
            .substringAfter("$REFRESH_COOKIE_NAME=")
            .substringBefore(";")
        val servletRequest = MockHttpServletRequest().apply {
            setCookies(Cookie(REFRESH_COOKIE_NAME, refreshToken))
        }

        val refreshResponse = refresh(servletRequest)

        assertEquals(HttpStatus.OK, refreshResponse.statusCode)
        assertEquals(OPERATOR_USERNAME, requireNotNull(refreshResponse.body).username)
    }

    @Test
    fun `logout clears refresh cookie`() {
        val response = logout()

        assertEquals(HttpStatus.NO_CONTENT, response.statusCode)
        assertTrue(requireNotNull(response.headers.getFirst(HttpHeaders.SET_COOKIE)).contains("Max-Age=0"))
    }

    @Test
    fun `mutating auth endpoints reject untrusted origin`() {
        val error = assertFailsWith<ResponseStatusException> {
            login(origin = UNTRUSTED_ORIGIN)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `mutating auth endpoints reject malformed referer as forbidden instead of server error`() {
        val error = assertFailsWith<ResponseStatusException> {
            login(origin = null, referer = MALFORMED_REFERER)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN, error.reason)
    }

    @Test
    fun `mutating auth endpoints reject missing csrf header`() {
        val error = assertFailsWith<ResponseStatusException> {
            login(csrfHeader = null)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(AuthApiErrors.CSRF_HEADER_REQUIRED, error.reason)
    }

    @Test
    fun `login rejects invalid credentials`() {
        val error = assertFailsWith<ResponseStatusException> {
            login(LoginRequest(OPERATOR_USERNAME, "wrong-password"))
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `login failure publishes security audit without touching password value`() {
        val audit = RecordingSecurityAuditPublisher()
        val auditedController = AuthController(
            sessions = AuthSessionService(users, passwordHasher, tokenService),
            registration = AuthRegistrationService(users, passwordHasher, settings.signupInvites),
            settings = settings,
            securityAuditPublisher = audit,
        )

        assertFailsWith<ResponseStatusException> {
            auditedController.login(
                LoginRequest(OPERATOR_USERNAME, "wrong-password"),
                TRUSTED_ORIGIN,
                null,
                AuthSecurityHeaders.CSRF_HEADER_VALUE,
            )
        }

        assertEquals(listOf("login-failed:$OPERATOR_USERNAME"), audit.events)
    }

    @Test
    fun `refresh rejects missing cookie`() {
        val error = assertFailsWith<ResponseStatusException> {
            refresh(MockHttpServletRequest())
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `me rejects missing or invalid bearer token`() {
        val missingError = assertFailsWith<ResponseStatusException> {
            controller.me(null)
        }
        val invalidError = assertFailsWith<ResponseStatusException> {
            controller.me("${AuthTokenContract.BEARER_PREFIX}not-a-token")
        }

        assertEquals(HttpStatus.UNAUTHORIZED, missingError.statusCode)
        assertEquals(HttpStatus.UNAUTHORIZED, invalidError.statusCode)
    }

    @Test
    fun `trusted referer is accepted when origin header is absent`() {
        val response = login(
            origin = null,
            referer = TRUSTED_LOGIN_REFERER,
        )

        assertEquals(HttpStatus.OK, response.statusCode)
    }

    private class RecordingSecurityAuditPublisher : SecurityAuditPublisher {
        val events = mutableListOf<String>()

        override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) {
            events.add("login-succeeded:${principal.username}")
        }

        override fun publishLoginFailed(username: String) {
            events.add("login-failed:$username")
        }

        override fun publishLogout(principal: AuthenticatedPrincipal?) {
            events.add("logout:${principal?.username}")
        }

        override fun publishRefreshFailed(reason: String) {
            events.add("refresh-failed:$reason")
        }

        override fun publishStreamAccess(
            principal: AuthenticatedPrincipal,
            streamId: String,
            publisherGroupId: GroupId,
            allowed: Boolean,
            reason: String,
        ) {
            events.add("stream:$streamId:${publisherGroupId.value}:$allowed")
        }
    }
}
