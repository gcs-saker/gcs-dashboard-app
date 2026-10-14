package kr.co.a4ai.gcssaker.authpolicy.configuration.observability

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class InternalOtlpEndpointGuardTest {
    @Test
    fun `disabled exporter does not require a reachable collector`() {
        assertDoesNotThrow {
            InternalOtlpEndpointGuard(false, "https://external.invalid/traces").validate()
        }
    }

    @Test
    fun `enabled exporter accepts only the internal trace receiver`() {
        assertDoesNotThrow {
            InternalOtlpEndpointGuard(true, "http://otel-collector:4318/v1/traces").validate()
        }
        assertThrows(IllegalArgumentException::class.java) {
            InternalOtlpEndpointGuard(true, "https://external.example/v1/traces").validate()
        }
        assertThrows(IllegalArgumentException::class.java) {
            InternalOtlpEndpointGuard(true, "http://otel-collector:4318/v1/metrics").validate()
        }
    }
}
