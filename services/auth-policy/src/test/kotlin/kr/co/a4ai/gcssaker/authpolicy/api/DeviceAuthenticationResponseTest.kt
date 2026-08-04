package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DeviceAuthenticationResponseTest {
    @Test
    fun `authentication response does not expose group routing metadata`() {
        val json = jacksonObjectMapper().writeValueAsString(
            DeviceAuthenticationResponse(
                deviceUuid = "device-001",
                credentialVersion = 2,
                devicePolicyVersion = 4,
            ),
        )

        assertTrue(json.contains("deviceUuid"))
        assertFalse(json.contains("groupId"))
        assertFalse(json.contains("co-a"))
    }
}
