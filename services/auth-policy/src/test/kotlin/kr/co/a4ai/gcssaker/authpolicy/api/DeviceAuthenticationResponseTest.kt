package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertTrue

class DeviceAuthenticationResponseTest {
    @Test
    fun `authentication response carries server owned group identity without routing address`() {
        val json = jacksonObjectMapper().writeValueAsString(
            DeviceAuthenticationResponse(
                deviceUuid = "device-001",
                groupId = "co-a",
                credentialVersion = 2,
                devicePolicyVersion = 4,
            ),
        )

        assertTrue(json.contains("deviceUuid"))
        assertTrue(json.contains("groupId"))
        assertTrue(json.contains("co-a"))
        assertTrue(!json.contains("streamPath"))
        assertTrue(!json.contains("publishUrl"))
    }
}
