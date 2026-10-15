package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryPageService
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryCursorCodec
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.security.JwtTelemetryCursorCodec
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class TelemetryPaginationConfiguration {
    @Bean
    fun telemetryCursorCodec(settings: AuthRuntimeSettings): TelemetryCursorCodec =
        JwtTelemetryCursorCodec(settings.jwtSecret, settings.jwtIssuer)

    @Bean
    fun telemetryPageService(repository: OperationalReadRepository, cursors: TelemetryCursorCodec) =
        TelemetryPageService(repository, cursors)
}
