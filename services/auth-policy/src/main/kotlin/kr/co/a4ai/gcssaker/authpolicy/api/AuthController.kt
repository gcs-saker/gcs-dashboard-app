package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.annotation.JsonProperty
import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Size
import kr.co.a4ai.gcssaker.authpolicy.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRejectedException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.Duration

data class LoginRequest(
    val username: String,
    val password: String,
)

data class SignupRequest(
    @field:Size(min = 3, max = 50)
    val username: String,
    @field:Email
    val email: String,
    @field:Size(min = 8, max = 128)
    val password: String,
    val inviteCode: String,
    val role: String = "viewer",
)

data class UserResponse(
    val id: Int,
    val username: String,
    val email: String,
    @get:JsonProperty(ApiFieldNames.COMPANY_ID)
    val companyId: Int,
    val role: String,
)

data class TokenResponse(
    @get:JsonProperty(ApiFieldNames.ACCESS_TOKEN)
    val accessToken: String,
    @get:JsonProperty(ApiFieldNames.TOKEN_TYPE)
    val tokenType: String = AuthTokenContract.BEARER_TOKEN_TYPE,
    @get:JsonProperty(ApiFieldNames.EXPIRES_IN_MINUTES)
    val expiresInMinutes: Long,
    val username: String,
    val role: String,
)

data class CurrentUserResponse(
    val username: String,
    val role: String,
)

@RestController
@RequestMapping(AuthApiRoutes.ROOT)
class AuthController(
    private val sessions: AuthSessionService,
    private val registration: AuthRegistrationService,
    private val settings: AuthRuntimeSettings,
) {
    @PostMapping(AuthApiRoutes.SIGNUP)
    fun signup(
        @Valid
        @RequestBody request: SignupRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<UserResponse> {
        assertTrustedOrigin(origin, referer)
        assertCsrfHeader(csrfHeader)
        val user = try {
            registration.signup(
                SignupCommand(
                    username = request.username,
                    email = request.email,
                    password = request.password,
                    inviteCode = request.inviteCode,
                    role = request.role,
                ),
            )
        } catch (exc: SignupRejectedException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, exc.message ?: AuthApiErrors.SIGNUP_REJECTED)
        } catch (exc: IllegalArgumentException) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                exc.message ?: AuthApiErrors.INVALID_SIGNUP_REQUEST,
            )
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(userResponse(user))
    }

    @PostMapping(AuthApiRoutes.LOGIN)
    fun login(
        @RequestBody request: LoginRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<TokenResponse> {
        assertTrustedOrigin(origin, referer)
        assertCsrfHeader(csrfHeader)
        val tokens = sessions.login(request.username, request.password)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthApiErrors.INVALID_CREDENTIALS)
        return tokenResponse(tokens.principal, tokens.accessToken, tokens.refreshToken, tokens.expiresInMinutes)
    }

    @PostMapping(AuthApiRoutes.REFRESH)
    fun refresh(
        servletRequest: HttpServletRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<TokenResponse> {
        assertTrustedOrigin(origin, referer)
        assertCsrfHeader(csrfHeader)
        val refreshToken = servletRequest.cookies
            ?.firstOrNull { it.name == settings.refreshCookieName }
            ?.value
        if (refreshToken.isNullOrBlank()) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthApiErrors.REFRESH_TOKEN_REQUIRED)
        }
        val tokens = try {
            sessions.refresh(refreshToken)
        } catch (_: JWTVerificationException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthApiErrors.INVALID_TOKEN)
        }
        if (tokens == null) {
            @Suppress("UNCHECKED_CAST")
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                .build<TokenResponse>()
        }
        return tokenResponse(tokens.principal, tokens.accessToken, tokens.refreshToken, tokens.expiresInMinutes)
    }

    @GetMapping(AuthApiRoutes.ME)
    fun me(@RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?): CurrentUserResponse {
        val token = authorization?.removePrefix(AuthTokenContract.BEARER_PREFIX)?.takeIf { it != authorization }
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthApiErrors.AUTHENTICATION_REQUIRED)
        val principal = try {
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthApiErrors.INVALID_TOKEN)
        }
        return CurrentUserResponse(username = principal.username, role = principal.role.name.lowercase())
    }

    @PostMapping(AuthApiRoutes.LOGOUT)
    fun logout(
        servletRequest: HttpServletRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<Void> {
        assertTrustedOrigin(origin, referer)
        assertCsrfHeader(csrfHeader)
        servletRequest.cookies
            ?.firstOrNull { it.name == settings.refreshCookieName }
            ?.value
            ?.takeIf { it.isNotBlank() }
            ?.let(sessions::revokeRefreshToken)
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
            .build()
    }

    private fun tokenResponse(
        principal: AuthenticatedPrincipal,
        accessToken: String,
        refreshToken: String,
        expiresInMinutes: Long,
    ): ResponseEntity<TokenResponse> =
        ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshToken).toString())
            .body(
                TokenResponse(
                    accessToken = accessToken,
                    expiresInMinutes = expiresInMinutes,
                    username = principal.username,
                    role = principal.role.name.lowercase(),
                ),
            )

    private fun userResponse(user: AuthUser): UserResponse =
        UserResponse(
            id = user.id,
            username = user.username,
            email = user.email,
            companyId = user.companyId,
            role = user.role.name.lowercase(),
        )

    private fun refreshCookie(refreshToken: String): ResponseCookie =
        ResponseCookie.from(settings.refreshCookieName, refreshToken)
            .httpOnly(true)
            .secure(settings.refreshCookieSecure)
            .sameSite(settings.refreshCookieSameSite)
            .path("/")
            .maxAge(Duration.ofMinutes(settings.refreshTokenExpireMinutes))
            .build()

    private fun clearRefreshCookie(): ResponseCookie =
        ResponseCookie.from(settings.refreshCookieName, "")
            .httpOnly(true)
            .secure(settings.refreshCookieSecure)
            .sameSite(settings.refreshCookieSameSite)
            .path("/")
            .maxAge(Duration.ZERO)
            .build()

    private fun assertTrustedOrigin(origin: String?, referer: String?) {
        val requestOrigin = origin ?: referer?.let { URI.create(it).let { uri -> "${uri.scheme}://${uri.authority}" } }
        if (requestOrigin == null || settings.allowedOrigins.isEmpty()) {
            return
        }
        if (requestOrigin !in settings.allowedOrigins) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN)
        }
    }

    private fun assertCsrfHeader(value: String?) {
        if (value != AuthSecurityHeaders.CSRF_HEADER_VALUE) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, AuthApiErrors.CSRF_HEADER_REQUIRED)
        }
    }
}
