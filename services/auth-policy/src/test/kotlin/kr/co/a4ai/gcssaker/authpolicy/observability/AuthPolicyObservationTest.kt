package kr.co.a4ai.gcssaker.authpolicy.observability

import io.micrometer.observation.ObservationRegistry
import kotlin.test.Test
import kotlin.test.assertEquals

class AuthPolicyObservationTest {
    @Test
    fun `observation wrapper returns block result without requiring external collector`() {
        val observation = AuthPolicyObservation(ObservationRegistry.NOOP)

        val result = observation.observe(AuthPolicyObservationNames.READINESS_JDBC) {
            "ok"
        }

        assertEquals("ok", result)
    }
}
