package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpHeaders
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED=false",
        "AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED=false",
        "AUTH_POLICY_REDIS_OPERATIONAL_EVENT_CACHE_ENABLED=false",
        "AUTH_POLICY_ALLOWED_ORIGINS=http://localhost:18080",
    ],
)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class AuthSecurityConfigTest @Autowired constructor(
    private val mockMvc: MockMvc,
    private val sessions: AuthSessionService,
) {
    @Test
    fun `public health route remains open without bearer auth`() {
        mockMvc.get(HealthApiRoutes.HEALTHZ)
            .andExpect {
                status { isOk() }
                header { exists(RequestTraceContract.CORRELATION_ID_HEADER) }
                header { string("X-Content-Type-Options", "nosniff") }
            }
    }

    @Test
    fun `protected current user route rejects missing bearer auth before controller work`() {
        mockMvc.get(AuthApiRoutes.ROOT + AuthApiRoutes.ME)
            .andExpect {
                status { isUnauthorized() }
                jsonPath("$.${AuthSecurityRouteContract.ERROR_DETAIL_FIELD}").value(AuthApiErrors.AUTHENTICATION_REQUIRED)
            }
    }

    @Test
    fun `protected ops route rejects missing bearer auth`() {
        mockMvc.get(OperationalEventApiRoutes.EVENTS)
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `protected current user route accepts valid bearer auth`() {
        mockMvc.get(AuthApiRoutes.ROOT + AuthApiRoutes.ME) {
            header(HttpHeaders.AUTHORIZATION, bearerAccessToken())
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.username").value(AuthSecurityConfigTestContract.OPERATOR_USERNAME)
                jsonPath("$.role").value(AuthSecurityConfigTestContract.OPERATOR_ROLE)
            }
    }

    @Test
    fun `public login route is not blocked by security filter chain`() {
        mockMvc.post(AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN) {
            header(HttpHeaders.ORIGIN, AuthSecurityConfigTestContract.TRUSTED_ORIGIN)
            header(AuthSecurityHeaders.CSRF_HEADER_NAME, AuthSecurityHeaders.CSRF_HEADER_VALUE)
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.LOGIN_PAYLOAD
        }
            .andExpect {
                status { isOk() }
            }
    }

    private fun bearerAccessToken(): String {
        val token = sessions.login(
            AuthSecurityConfigTestContract.OPERATOR_USERNAME,
            AuthSecurityConfigTestContract.OPERATOR_PASSWORD,
        )?.accessToken ?: error(AuthSecurityConfigTestContract.LOGIN_SETUP_FAILED)
        return "${AuthTokenContract.BEARER_PREFIX}$token"
    }
}

private object AuthSecurityConfigTestContract {
    const val TRUSTED_ORIGIN = "http://localhost:18080"
    const val OPERATOR_USERNAME = "operator01"
    const val OPERATOR_PASSWORD = "correct-password"
    const val OPERATOR_ROLE = "operator"
    const val LOGIN_SETUP_FAILED = "test login failed"
    const val LOGIN_PAYLOAD = """{"username":"operator01","password":"correct-password"}"""
}
