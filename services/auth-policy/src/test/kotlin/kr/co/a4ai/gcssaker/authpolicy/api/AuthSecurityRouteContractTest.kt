package kr.co.a4ai.gcssaker.authpolicy.api

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod

class AuthSecurityRouteContractTest {
    @Test
    fun `cors contract allows every mutating controller method`() {
        assertTrue(AuthSecurityRouteContract.CORS_METHODS.containsAll(listOf(
            HttpMethod.POST.name(),
            HttpMethod.PUT.name(),
            HttpMethod.PATCH.name(),
            HttpMethod.DELETE.name(),
        )))
    }
}
