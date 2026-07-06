package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.web.AuthenticationEntryPoint

class JsonAuthenticationEntryPoint : AuthenticationEntryPoint {
    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: org.springframework.security.core.AuthenticationException,
    ) {
        if (response.isCommitted) return
        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.writer.write("""{"${AuthSecurityRouteContract.ERROR_DETAIL_FIELD}":"${AuthApiErrors.AUTHENTICATION_REQUIRED}"}""")
    }
}
