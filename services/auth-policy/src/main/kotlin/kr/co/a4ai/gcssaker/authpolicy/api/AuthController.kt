package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.application.NoopSecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthRegistrationService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupRejectedException
import kr.co.a4ai.gcssaker.authpolicy.domain.DuplicateAuthUserException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(AuthApiRoutes.ROOT)
class AuthController(
    private val sessions: AuthSessionService,
    private val registration: AuthRegistrationService,
    private val settings: AuthRuntimeSettings,
    private val securityAuditPublisher: SecurityAuditPublisher = NoopSecurityAuditPublisher,
) {
    private val responses = AuthResponseFactory(settings)
    private val requestGuard = AuthRequestGuard(sessions, settings)

    @PostMapping(AuthApiRoutes.SIGNUP)
    fun signup(
        @Valid
        @RequestBody request: SignupRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<UserResponse> {
        requestGuard.assertBrowserWrite(origin, referer, csrfHeader)
        val user = try {
            registration.signup(
                SignupCommand(
                    username = request.username,
                    email = request.email,
                    password = request.password,
                    inviteCode = request.inviteCode,
                ),
            )
        } catch (exc: DuplicateAuthUserException) {
            throw ConflictApiError(exc.message ?: AuthApiErrors.SIGNUP_REJECTED)
        } catch (exc: SignupRejectedException) {
            throw BadRequestApiError(exc.message ?: AuthApiErrors.SIGNUP_REJECTED)
        } catch (exc: IllegalArgumentException) {
            throw BadRequestApiError(exc.message ?: AuthApiErrors.INVALID_SIGNUP_REQUEST)
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(responses.userResponse(user))
    }

    @PostMapping(AuthApiRoutes.LOGIN)
    fun login(
        @RequestBody request: LoginRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<TokenResponse> {
        requestGuard.assertBrowserWrite(origin, referer, csrfHeader)
        val tokens = sessions.login(request.username, request.password)
        if (tokens == null) {
            securityAuditPublisher.publishLoginFailed(request.username)
            throw UnauthorizedApiError(AuthApiErrors.INVALID_CREDENTIALS)
        }
        securityAuditPublisher.publishLoginSucceeded(tokens.principal)
        return responses.tokenResponse(tokens.principal, tokens.accessToken, tokens.refreshToken, tokens.expiresInMinutes)
    }

    @PostMapping(AuthApiRoutes.REFRESH)
    fun refresh(
        servletRequest: HttpServletRequest,
        @RequestHeader(HttpHeaders.ORIGIN, required = false) origin: String?,
        @RequestHeader(HttpHeaders.REFERER, required = false) referer: String?,
        @RequestHeader(AuthSecurityHeaders.CSRF_HEADER_NAME, required = false) csrfHeader: String?,
    ): ResponseEntity<TokenResponse> {
        requestGuard.assertBrowserWrite(origin, referer, csrfHeader)
        val refreshToken = try {
            requestGuard.requireRefreshToken(servletRequest)
        } catch (error: UnauthorizedApiError) {
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.REFRESH_TOKEN_REQUIRED)
            throw error
        }
        val tokens = try {
            sessions.refresh(refreshToken)
        } catch (_: JWTVerificationException) {
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.INVALID_TOKEN)
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        }
        if (tokens == null) {
            securityAuditPublisher.publishRefreshFailed(AuthApiErrors.INVALID_TOKEN)
            return responses.unauthorizedWithClearedRefreshCookie()
        }
        return responses.tokenResponse(tokens.principal, tokens.accessToken, tokens.refreshToken, tokens.expiresInMinutes)
    }

    @GetMapping(AuthApiRoutes.ME)
    @RequiresBearerAuth
    fun me(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): CurrentUserResponse {
        val principal = requestGuard.requireCurrentPrincipal(authorization)
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
        requestGuard.assertBrowserWrite(origin, referer, csrfHeader)
        refreshTokenFromCookie(servletRequest.cookies, settings.refreshCookieName)
            ?.let(sessions::revokeRefreshToken)
        securityAuditPublisher.publishLogout(BearerPrincipalResolver(sessions).principalOrNull(authorization))
        return responses.logoutResponse()
    }
}
