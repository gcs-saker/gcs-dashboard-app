package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionEffects
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupPolicyService
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryWriteAuthorizationService
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryAlertRuleEngine
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPublisher
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class TelemetryWriteConfiguration {
    @Bean
    fun telemetryIngestionEffects(geofence: GeofenceTelemetryEvaluator, alerts: TelemetryAlertRuleEngine, publisher: TelemetryPublisher) =
        TelemetryIngestionEffects(geofence, alerts, publisher)

    @Bean
    fun telemetryWriteAuthorization(policy: GroupPolicyService, devices: RegisteredDeviceRepository) =
        TelemetryWriteAuthorizationService(policy, devices)

    @Bean
    fun telemetryIngestionService(repository: OperationalReadRepository, effects: TelemetryIngestionEffects) =
        TelemetryIngestionService(repository, effects)
}
