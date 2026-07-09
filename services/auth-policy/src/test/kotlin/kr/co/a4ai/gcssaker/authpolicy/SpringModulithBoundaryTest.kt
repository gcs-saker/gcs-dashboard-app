package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import kotlin.test.assertEquals

class SpringModulithBoundaryTest {
    @Test
    fun `declared application modules keep their allowed dependencies`() {
        ApplicationModules.of(AuthPolicyApplication::class.java).verify()
    }

    @Test
    fun `auth policy exposes only the expected module boundaries`() {
        val moduleNames = ApplicationModules.of(AuthPolicyApplication::class.java)
            .map { it.identifier.toString() }
            .toSet()

        assertEquals(
            setOf("api", "application", "configuration", "domain", "infrastructure", "observability", "protocol"),
            moduleNames,
        )
    }
}
