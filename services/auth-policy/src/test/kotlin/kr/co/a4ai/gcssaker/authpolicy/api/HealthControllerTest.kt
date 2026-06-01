package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertEquals

class HealthControllerTest {
    @Test
    fun `health endpoint reports service status`() {
        val response = HealthController().healthz()

        assertEquals("ok", response.status)
        assertEquals("auth-policy", response.service)
    }
}
