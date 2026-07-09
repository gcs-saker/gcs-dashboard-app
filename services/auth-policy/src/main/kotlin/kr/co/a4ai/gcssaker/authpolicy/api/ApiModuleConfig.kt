package kr.co.a4ai.gcssaker.authpolicy.api

import io.micrometer.tracing.Tracer
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Duration

@Configuration
class ApiModuleConfig {
    @Bean
    fun bearerPrincipalResolver(sessions: AuthSessionService): BearerPrincipalResolver =
        BearerPrincipalResolver(sessions)

    @Bean
    fun graphQlQueryPolicy(): GraphQlQueryPolicy = GraphQlQueryPolicy()

    @Bean
    fun correlationIdFilterRegistration(tracer: ObjectProvider<Tracer>): FilterRegistrationBean<CorrelationIdFilter> =
        FilterRegistrationBean(CorrelationIdFilter(tracer.getIfAvailable())).apply {
            order = 1
            addUrlPatterns("/*")
        }

    @Bean
    fun authRateLimiter(settings: AuthRuntimeSettings): FixedWindowRateLimiter =
        FixedWindowRateLimiter(
            maxRequests = settings.authRateLimitPerMinute,
            window = Duration.ofMinutes(1),
        )

    @Bean
    fun rateLimitFilterRegistration(
        settings: AuthRuntimeSettings,
        authRateLimiter: FixedWindowRateLimiter,
    ): FilterRegistrationBean<RateLimitFilter> =
        FilterRegistrationBean(RateLimitFilter(authRateLimiter, settings.authRateLimitEnabled)).apply {
            order = 2
            addUrlPatterns("${AuthApiRoutes.ROOT}/*")
        }
}
