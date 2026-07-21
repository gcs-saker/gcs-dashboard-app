package kr.co.a4ai.gcssaker.authpolicy.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import kotlin.test.assertEquals
import kotlin.test.assertFalse

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED=false",
        "AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED=false",
        "AUTH_POLICY_REDIS_OPERATIONAL_EVENT_CACHE_ENABLED=false",
        "AUTH_POLICY_ALLOWED_ORIGINS=http://localhost:18080",
    ],
)
@ActiveProfiles("test")
class DeviceBootstrapRuntimeSecurityTest @Autowired constructor(
    private val restTemplate: TestRestTemplate,
) {
    @Test
    fun `invalid edge bootstrap token keeps domain forbidden status through error dispatch`() {
        val response = restTemplate.postForEntity(
            DeviceBootstrapApiRoutes.EDGE_ROOT + DeviceBootstrapApiRoutes.REGISTER,
            HttpEntity(DeviceBootstrapRuntimeSecurityFixtures.bootstrapRequest(), jsonHeaders()),
            String::class.java,
        )

        assertEquals(HttpStatus.FORBIDDEN, response.statusCode)
        assertFalse(response.body.orEmpty().contains(AuthApiErrors.AUTHENTICATION_REQUIRED))
    }

    private fun jsonHeaders(): HttpHeaders =
        HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
        }
}

private object DeviceBootstrapRuntimeSecurityFixtures {
    fun bootstrapRequest(): DeviceBootstrapRequest =
        DeviceBootstrapRequest(
            provisioningToken = "invalid-token",
            displayName = "debug-device",
            deviceType = "drone",
            sensors = emptyList(),
            streamPaths = emptyList(),
        )
}
