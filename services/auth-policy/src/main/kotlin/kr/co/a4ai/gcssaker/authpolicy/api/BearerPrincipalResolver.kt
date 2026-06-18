package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService

class BearerPrincipalResolver(
    private val sessions: AuthSessionService,
) {
    fun requirePrincipal(authorization: String?) =
        try {
            val token = authorization?.removePrefix(AuthTokenContract.BEARER_PREFIX)?.takeIf { it != authorization }
                ?: throw UnauthorizedApiError(AuthApiErrors.AUTHENTICATION_REQUIRED)
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        } catch (_: IllegalArgumentException) {
            throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)
        }

    fun principalOrNull(authorization: String?) =
        runCatching { requirePrincipal(authorization) }.getOrNull()
}
