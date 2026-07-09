package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath

@SpringBootTest(
    properties = [
        "AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED=false",
        "AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED=false",
        "AUTH_POLICY_REDIS_OPERATIONAL_EVENT_CACHE_ENABLED=false",
    ],
)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OperationalEventGraphQlControllerTest @Autowired constructor(
    private val mockMvc: MockMvc,
    private val sessions: AuthSessionService,
) {
    @Test
    fun `graphql operational events use bearer auth and return requested fields`() {
        mockMvc.post(GraphQlApiRoutes.GRAPHQL) {
            contentType = MediaType.APPLICATION_JSON
            header(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, bearerAccessToken())
            content = operationalEventsQuery()
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.data.operationalEvents[0].id").value("ops-network-001")
                jsonPath("$.data.operationalEvents[0].source").value("TURN 릴레이")
                jsonPath("$.data.operationalEvents[0].latencyMs").value(164)
            }
    }

    @Test
    fun `graphql operational events reject missing bearer auth`() {
        mockMvc.post(GraphQlApiRoutes.GRAPHQL) {
            contentType = MediaType.APPLICATION_JSON
            content = operationalEventsQuery()
        }
            .andExpect {
                status { isUnauthorized() }
                jsonPath("$.detail").value(AuthApiErrors.AUTHENTICATION_REQUIRED)
            }
    }

    @Test
    fun `graphql operational event page returns projected fields and cursor`() {
        mockMvc.post(GraphQlApiRoutes.GRAPHQL) {
            contentType = MediaType.APPLICATION_JSON
            header(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, bearerAccessToken())
            content = operationalEventPageQuery()
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.data.operationalEventPage.events[0].id").value("ops-security-001")
                jsonPath("$.data.operationalEventPage.nextCursor").isString
            }
    }

    @Test
    fun `graphql rejects introspection query before exposing schema details`() {
        mockMvc.post(GraphQlApiRoutes.GRAPHQL) {
            contentType = MediaType.APPLICATION_JSON
            header(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, bearerAccessToken())
            content = introspectionQuery()
        }
            .andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `graphql rejects excessive query depth before resolver execution`() {
        mockMvc.post(GraphQlApiRoutes.GRAPHQL) {
            contentType = MediaType.APPLICATION_JSON
            header(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, bearerAccessToken())
            content = tooDeepQuery()
        }
            .andExpect {
                status { isBadRequest() }
            }
    }

    private fun bearerAccessToken(): String {
        val token = sessions.login("operator01", "correct-password")?.accessToken
            ?: error("test login failed")
        return "${AuthTokenContract.BEARER_PREFIX}$token"
    }

    private fun operationalEventsQuery(): String =
        """
        {
          "query": "query { operationalEvents(severity: \"warn\", query: \"ICE\") { id source latencyMs } }"
        }
        """.trimIndent()

    private fun operationalEventPageQuery(): String =
        """
        {
          "query": "query { operationalEventPage(limit: 1) { events { id severity } nextCursor } }"
        }
        """.trimIndent()

    private fun introspectionQuery(): String =
        """
        {
          "query": "query { __schema { queryType { name } } }"
        }
        """.trimIndent()

    private fun tooDeepQuery(): String =
        """
        {
          "query": "query { a { b { c { d { e { f { g } } } } } } }"
        }
        """.trimIndent()
}
