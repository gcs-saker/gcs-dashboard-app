package kr.co.a4ai.gcssaker.authpolicy.configuration

import io.micrometer.observation.ObservationRegistry
import kr.co.a4ai.gcssaker.authpolicy.observability.AuthPolicyObservation
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OperationalObservabilityConfiguration {
    @Bean
    fun authPolicyObservation(registry: ObservationRegistry): AuthPolicyObservation =
        AuthPolicyObservation(registry)
}
