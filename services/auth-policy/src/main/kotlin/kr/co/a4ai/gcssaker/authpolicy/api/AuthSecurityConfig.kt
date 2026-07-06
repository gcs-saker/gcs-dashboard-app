package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
class AuthSecurityConfig {
    @Bean
    @Order(0)
    fun authEndpointSecurityFilterChain(
        http: HttpSecurity,
        settings: AuthRuntimeSettings,
    ): SecurityFilterChain {
        http
            .securityMatcher(PathPatternRequestMatcher.withDefaults().matcher(AuthSecurityRouteContract.AUTH_PREFIX))
            .csrf { csrf -> csrf.disable() }
            .cors { cors -> cors.configurationSource(corsConfigurationSource(settings)) }
            .sessionManagement { sessionsConfig ->
                sessionsConfig.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            }
            .formLogin { form -> form.disable() }
            .httpBasic { basic -> basic.disable() }
            .logout { logout -> logout.disable() }
            .authorizeHttpRequests { requests ->
                requests.anyRequest().permitAll()
            }
        return http.build()
    }

    @Bean
    @Order(1)
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
                    requests.requestMatchers(matcher.toPathPatternRequestMatcher()).permitAll()
                }
                AuthSecurityRouteContract.PROTECTED_MATCHERS.forEach { matcher ->
                    requests.requestMatchers(matcher.toPathPatternRequestMatcher()).authenticated()
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
