package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class BearerPrincipalResolver(
    private val sessions: AuthSessionService,
) {
    fun requirePrincipal(authorization: String?) =
        try {
            val token = authorization?.removePrefix(AuthTokenContract.BEARER_PREFIX)?.takeIf { it != authorization }
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthErrorMessages.AUTHENTICATION_REQUIRED)
            sessions.verifyAccessToken(token)
        } catch (_: JWTVerificationException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthErrorMessages.INVALID_TOKEN)
        } catch (_: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, AuthErrorMessages.INVALID_TOKEN)
        }
}
