package kr.co.a4ai.gcssaker.authpolicy.api

import com.auth0.jwt.exceptions.JWTVerificationException
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import kr.co.a4ai.gcssaker.authpolicy.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.OncePerRequestFilter

@Configuration
class AuthSecurityConfig {
    @Bean
    fun authPolicySecurityFilterChain(
        http: HttpSecurity,
        settings: AuthRuntimeSettings,
        sessions: AuthSessionService,
    ): SecurityFilterChain {
        val entryPoint = JsonAuthenticationEntryPoint()
        http
            .csrf { csrf -> csrf.disable() }
            .cors { cors -> cors.configurationSource(corsConfigurationSource(settings)) }
            .sessionManagement { sessionsConfig ->
                sessionsConfig.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            }
            .formLogin { form -> form.disable() }
            .httpBasic { basic -> basic.disable() }
            .logout { logout -> logout.disable() }
            .exceptionHandling { exceptions -> exceptions.authenticationEntryPoint(entryPoint) }
            .headers { headers ->
                headers.frameOptions { frame -> frame.deny() }
                headers.contentTypeOptions { }
            }
            .authorizeHttpRequests { requests ->
                AuthSecurityRouteContract.PUBLIC_MATCHERS.forEach { matcher ->
                    if (matcher.method == null) {
                        requests.requestMatchers(matcher.pattern).permitAll()
                    } else {
                        requests.requestMatchers(matcher.method, matcher.pattern).permitAll()
                    }
                }
                AuthSecurityRouteContract.PROTECTED_MATCHERS.forEach { matcher ->
                    if (matcher.method == null) {
                        requests.requestMatchers(matcher.pattern).authenticated()
                    } else {
                        requests.requestMatchers(matcher.method, matcher.pattern).authenticated()
                    }
                }
                requests.anyRequest().authenticated()
            }
            .addFilterBefore(
                BearerAuthenticationFilter(sessions, entryPoint),
                UsernamePasswordAuthenticationFilter::class.java,
            )
        return http.build()
    }

    private fun corsConfigurationSource(settings: AuthRuntimeSettings): CorsConfigurationSource {
        val configuration = CorsConfiguration()
        configuration.allowedOrigins = settings.allowedOrigins.toSet().toList()
        configuration.allowedMethods = AuthSecurityRouteContract.CORS_METHODS
        configuration.allowedHeaders = AuthSecurityRouteContract.CORS_HEADERS
        configuration.exposedHeaders = RequestTraceContract.EXPOSED_HEADERS
        configuration.allowCredentials = true
        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration(AuthSecurityRouteContract.ALL_PATHS, configuration)
        return source
    }
}

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

object AuthSecurityRouteContract {
    const val ALL_PATHS = "/**"
    const val ERROR_DETAIL_FIELD = "detail"
    private const val ACTUATOR_HEALTH = "/actuator/health"
    private const val ACTUATOR_INFO = "/actuator/info"
    private const val ACTUATOR_PROMETHEUS = "/actuator/prometheus"
    private const val GRAPHQL = GraphQlApiRoutes.GRAPHQL
    private const val OPS_PREFIX = "/ops/**"
    private const val TELEMETRY_PREFIX = "/telemetry/**"
    private const val ASSET_PREFIX = "/asset/**"
    private const val ROLE_PREFIX = "ROLE_"

    val CORS_METHODS = listOf(
        HttpMethod.GET.name(),
        HttpMethod.POST.name(),
        HttpMethod.OPTIONS.name(),
    )
    val CORS_HEADERS = listOf(
        HttpHeaders.AUTHORIZATION,
        HttpHeaders.CONTENT_TYPE,
        AuthSecurityHeaders.CSRF_HEADER_NAME,
        RequestTraceContract.CORRELATION_ID_HEADER,
        RequestTraceContract.TRACEPARENT_HEADER,
    )
    val PUBLIC_MATCHERS = listOf(
        RouteMatcher(HttpMethod.GET, HealthApiRoutes.HEALTHZ),
        RouteMatcher(HttpMethod.GET, HealthApiRoutes.READYZ),
        RouteMatcher(HttpMethod.GET, ACTUATOR_HEALTH),
        RouteMatcher(HttpMethod.GET, ACTUATOR_INFO),
        RouteMatcher(HttpMethod.GET, ACTUATOR_PROMETHEUS),
        RouteMatcher(HttpMethod.OPTIONS, ALL_PATHS),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH),
        RouteMatcher(HttpMethod.POST, AuthApiRoutes.ROOT + AuthApiRoutes.LOGOUT),
    )
    val PROTECTED_MATCHERS = listOf(
        RouteMatcher(HttpMethod.GET, AuthApiRoutes.ROOT + AuthApiRoutes.ME),
        RouteMatcher(null, StreamPolicyApiRoutes.ROOT + "/**"),
        RouteMatcher(null, OPS_PREFIX),
        RouteMatcher(null, TELEMETRY_PREFIX),
        RouteMatcher(null, ASSET_PREFIX),
        RouteMatcher(null, GRAPHQL),
    )

    fun roleAuthority(roleName: String): String = ROLE_PREFIX + roleName.uppercase()
}

data class RouteMatcher(
    val method: HttpMethod?,
    val pattern: String,
)
