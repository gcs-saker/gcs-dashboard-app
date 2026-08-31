package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import org.springframework.http.HttpHeaders
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.web.filter.OncePerRequestFilter

class BearerAuthenticationFilter(
    private val sessions: AuthSessionService,
    private val entryPoint: AuthenticationEntryPoint,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val authorization = request.getHeader(HttpHeaders.AUTHORIZATION)
        if (authorization.isNullOrBlank()) {
            filterChain.doFilter(request, response)
            return
        }
        val token = authorization.removePrefix(AuthTokenContract.BEARER_PREFIX)
            .takeIf { it != authorization && it.isNotBlank() }
        if (token == null) {
            entryPoint.commence(request, response, BadCredentialsException(AuthApiErrors.INVALID_TOKEN))
            return
        }
        try {
            val principal = sessions.verifyAccessToken(token)
            SecurityContextHolder.getContext().authentication = principal.toAuthentication()
            filterChain.doFilter(request, response)
        } catch (error: JWTVerificationException) {
            entryPoint.commence(request, response, BadCredentialsException(AuthApiErrors.INVALID_TOKEN, error))
        } catch (error: IllegalArgumentException) {
            entryPoint.commence(request, response, BadCredentialsException(AuthApiErrors.INVALID_TOKEN, error))
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    private fun AuthenticatedPrincipal.toAuthentication(): UsernamePasswordAuthenticationToken =
        UsernamePasswordAuthenticationToken(
            this,
            null,
            listOf(SimpleGrantedAuthority(AuthSecurityRouteContract.roleAuthority(role.name))),
        )
}
