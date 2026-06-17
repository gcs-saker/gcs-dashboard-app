package kr.co.a4ai.gcssaker.authpolicy.api

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.http.HttpStatus

class GraphQlQueryPolicyTest {
    @Test
    fun `allows projected operational event page query within depth limit`() {
        val policy = GraphQlQueryPolicy(maxQueryDepth = 4)

        assertDoesNotThrow {
            policy.validate("query { operationalEventPage(limit: 10) { events { id severity latencyMs } nextCursor } }")
        }
    }

    @Test
    fun `rejects excessively nested query before resolver execution`() {
        val policy = GraphQlQueryPolicy(maxQueryDepth = 3)

        val error = assertThrows<BadRequestApiError> {
            policy.validate("query { a { b { c { d } } } }")
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
        assertEquals(GraphQlApiErrors.QUERY_TOO_DEEP, error.reason)
    }

    @Test
    fun `does not count braces inside string arguments as query depth`() {
        val policy = GraphQlQueryPolicy(maxQueryDepth = 2)

        assertDoesNotThrow {
            policy.validate("query { operationalEvents(query: \"{not a selection}\") { id } }")
        }
    }
}
