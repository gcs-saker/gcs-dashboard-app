package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpHeaders
import org.springframework.context.ApplicationContext
import org.springframework.security.core.userdetails.UserDetailsService
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
    private val users: AuthUserRepository,
    private val applicationContext: ApplicationContext,
) {
    @Test
    fun `production context does not create a generated development password user`() {
        assertTrue(applicationContext.getBeansOfType(UserDetailsService::class.java).isEmpty())
    }

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

    @Test
    fun `public login route without csrf reaches browser write guard`() {
        mockMvc.post(AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN) {
            header(HttpHeaders.ORIGIN, AuthSecurityConfigTestContract.TRUSTED_ORIGIN)
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.LOGIN_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
                jsonPath("$.${AuthSecurityRouteContract.ERROR_DETAIL_FIELD}").value(AuthApiErrors.CSRF_HEADER_REQUIRED)
            }
    }

    @Test
    fun `device publish policy route uses device credential instead of bearer session`() {
        mockMvc.post(DevicePolicyApiRoutes.ROOT + DevicePolicyApiRoutes.PUBLISH) {
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.DEVICE_PUBLISH_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `device bootstrap route is public but requires provisioning token`() {
        mockMvc.post(DeviceBootstrapApiRoutes.ROOT + DeviceBootstrapApiRoutes.REGISTER) {
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.DEVICE_BOOTSTRAP_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `edge prefixed device bootstrap route is public but requires provisioning token`() {
        mockMvc.post(DeviceBootstrapApiRoutes.EDGE_ROOT + DeviceBootstrapApiRoutes.REGISTER) {
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.DEVICE_BOOTSTRAP_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `device telemetry route accepts uuid credential authentication at controller boundary`() {
        mockMvc.post("/api/v1/devices/unknown-device/telemetry") {
            header(DeviceTelemetryAuthHeaders.DEVICE_UUID, "unknown-device")
            header(DeviceTelemetryAuthHeaders.DEVICE_CREDENTIAL, "wrong")
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = """{"uuid":"unknown-device","observedUnixMillis":1}"""
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `admin device route rejects non admin bearer auth at security boundary`() {
        mockMvc.post(AdminDeviceApiRoutes.ROOT) {
            header(HttpHeaders.AUTHORIZATION, bearerAccessToken())
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.ADMIN_DEVICE_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `admin provisioning token route rejects non admin bearer auth at security boundary`() {
        mockMvc.post(AdminProvisioningTokenApiRoutes.ROOT) {
            header(HttpHeaders.AUTHORIZATION, bearerAccessToken())
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = AuthSecurityConfigTestContract.ADMIN_PROVISIONING_TOKEN_PAYLOAD
        }
            .andExpect {
                status { isForbidden() }
                jsonPath("$.code").value("group_administrator_role_required")
            }
    }

    @Test
    fun `group administrator reaches shared resource API and manages only own group`() {
        val current = users.findByUsername(AuthSecurityConfigTestContract.OPERATOR_USERNAME)
            ?: error(AuthSecurityConfigTestContract.LOGIN_SETUP_FAILED)
        users.update(current.copy(role = UserRole.GROUP_ADMIN, securityVersion = current.securityVersion + 1))
        try {
            val authorization = bearerAccessToken()
            mockMvc.get("/api/v1/groups/co-a/members") {
                header(HttpHeaders.AUTHORIZATION, authorization)
            }.andExpect {
                status { isOk() }
            }
            mockMvc.get("/api/v1/groups/co-b/members") {
                header(HttpHeaders.AUTHORIZATION, authorization)
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code").value("group_management_scope_required")
            }
        } finally {
            users.update(current.copy(securityVersion = current.securityVersion + 2))
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
    const val ADMIN_DEVICE_PAYLOAD = """{"groupId":"co-a","displayName":"Daegu Drone 01"}"""
    const val ADMIN_PROVISIONING_TOKEN_PAYLOAD =
        """{"groupId":"co-a","label":"Daegu field bootstrap","ttlMinutes":60,"maxUses":1}"""
    const val DEVICE_PUBLISH_PAYLOAD =
        """{"deviceUuid":"unknown-device","credential":"wrong","streamId":"raw.front.drone-1","path":"raw/front/drone-1"}"""
    const val DEVICE_BOOTSTRAP_PAYLOAD =
        """{"provisioningToken":"wrong","displayName":"Bootstrap Drone 01","deviceType":"drone"}"""
}
