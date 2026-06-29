package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.application.NoopSecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
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
import org.springframework.http.CacheControl
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.net.URI
import java.time.Duration

@RestController
@RequestMapping(AuthApiRoutes.ROOT)
class AuthController(
    private val sessions: AuthSessionService,
    private val registration: AuthRegistrationService,
    private val settings: AuthRuntimeSettings,
    private val securityAuditPublisher: SecurityAuditPublisher = NoopSecurityAuditPublisher,
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
            throw BadRequestApiError(exc.message ?: AuthApiErrors.SIGNUP_REJECTED)
        } catch (exc: IllegalArgumentException) {
            throw BadRequestApiError(exc.message ?: AuthApiErrors.INVALID_SIGNUP_REQUEST)
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
        if (tokens == null) {
            securityAuditPublisher.publishLoginFailed(request.username)
            throw UnauthorizedApiError(AuthApiErrors.INVALID_CREDENTIALS)
        }
        securityAuditPublisher.publishLoginSucceeded(tokens.principal)
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
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.REFRESH_TOKEN_REQUIRED)
            throw UnauthorizedApiError(AuthApiErrors.REFRESH_TOKEN_REQUIRED)
        }
        val tokens = try {
            sessions.refresh(refreshToken)
        } catch (_: JWTVerificationException) {
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.INVALID_TOKEN)
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        }
        if (tokens == null) {
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.INVALID_TOKEN)
            @Suppress("UNCHECKED_CAST")
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                .cacheControl(CacheControl.noStore())
                .header(AuthResponseHeaders.PRAGMA_HEADER_NAME, AuthResponseHeaders.PRAGMA_NO_CACHE)
                .build<TokenResponse>()
        }
        return tokenResponse(tokens.principal, tokens.accessToken, tokens.refreshToken, tokens.expiresInMinutes)
    }

    @GetMapping(AuthApiRoutes.ME)
    @RequiresBearerAuth
    fun me(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): CurrentUserResponse {
        val token = authorization?.removePrefix(AuthTokenContract.BEARER_PREFIX)?.takeIf { it != authorization }
            ?: throw UnauthorizedApiError(AuthApiErrors.AUTHENTICATION_REQUIRED)
        val principal = try {
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        }
        return CurrentUserResponse(username = principal.username, role = principal.role.name.lowercase())
    }

    @PostMapping(AuthApiRoutes.LOGOUT)
    fun logout(
        servletRequest: HttpServletRequest,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
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
        securityAuditPublisher.publishLogout(BearerPrincipalResolver(sessions).principalOrNull(authorization))
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
            .cacheControl(CacheControl.noStore())
            .header(AuthResponseHeaders.PRAGMA_HEADER_NAME, AuthResponseHeaders.PRAGMA_NO_CACHE)
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
        val requestOrigin = origin ?: referer?.let {
            runCatching {
                URI.create(it).let { uri -> "${uri.scheme}://${uri.authority}" }
            }.getOrElse {
                throw ForbiddenApiError(AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN)
            }
        }
        if (requestOrigin == null || settings.allowedOrigins.isEmpty()) {
            return
        }
        if (requestOrigin !in settings.allowedOrigins) {
            throw ForbiddenApiError(AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN)
        }
    }

    private fun assertCsrfHeader(value: String?) {
        if (value != AuthSecurityHeaders.CSRF_HEADER_VALUE) {
            throw ForbiddenApiError(AuthApiErrors.CSRF_HEADER_REQUIRED)
        }
    }
}
