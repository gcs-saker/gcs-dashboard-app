package kr.co.a4ai.gcssaker.authpolicy.observability

import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationRegistry

object AuthPolicyObservationNames {
    const val READINESS_JDBC = "auth-policy.readiness.jdbc"
    const val READINESS_REDIS = "auth-policy.readiness.redis"
}

class AuthPolicyObservation(
    private val registry: ObservationRegistry,
) {
    fun <T : Any> observe(name: String, block: () -> T): T =
        Observation.createNotStarted(name, registry).observe(block) ?: block()
}
