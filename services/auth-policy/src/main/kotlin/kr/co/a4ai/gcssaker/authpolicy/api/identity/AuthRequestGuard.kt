package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.http.HttpServletRequest
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal

internal class AuthRequestGuard(
    private val sessions: AuthSessionService,
    private val settings: AuthRuntimeSettings,
) {
    fun assertBrowserWrite(origin: String?, referer: String?, csrfHeader: String?) {
        settings.assertTrustedOrigin(origin, referer)
        assertCsrfHeader(csrfHeader)
    }

    fun requireRefreshToken(request: HttpServletRequest): String =
        refreshTokenFromCookie(request.cookies, settings.refreshCookieName)
            ?: throw UnauthorizedApiError(AuthApiErrors.REFRESH_TOKEN_REQUIRED)

    fun requireCurrentPrincipal(authorization: String?): AuthenticatedPrincipal {
        val token = bearerTokenFromAuthorization(authorization)
        return try {
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        }
    }
}
