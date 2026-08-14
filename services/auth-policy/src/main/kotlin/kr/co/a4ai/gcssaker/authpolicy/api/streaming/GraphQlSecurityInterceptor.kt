package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.graphql.server.WebGraphQlInterceptor
import org.springframework.graphql.server.WebGraphQlRequest
import org.springframework.graphql.server.WebGraphQlResponse
import org.springframework.stereotype.Component
import reactor.core.publisher.Mono

class GraphQlQueryPolicy(
    private val maxQueryLength: Int = GraphQlSecurityPolicy.MAX_QUERY_LENGTH,
    private val maxQueryDepth: Int = GraphQlSecurityPolicy.MAX_QUERY_DEPTH,
) {
    fun validate(document: String) {
        if (document.length > maxQueryLength) {
            throw BadRequestApiError(GraphQlApiErrors.QUERY_TOO_LARGE)
        }
        if (queryDepth(document) > maxQueryDepth) {
            throw BadRequestApiError(GraphQlApiErrors.QUERY_TOO_DEEP)
        }
        if (
            document.contains(GraphQlSecurityPolicy.INTROSPECTION_SCHEMA_FIELD) ||
            document.contains(GraphQlSecurityPolicy.INTROSPECTION_TYPE_FIELD)
        ) {
            throw BadRequestApiError(GraphQlApiErrors.INTROSPECTION_DISABLED)
        }
    }

    private fun queryDepth(document: String): Int {
        var depth = 0
        var maxDepth = 0
        var inString = false
        var escaped = false
        for (char in document) {
            when {
                escaped -> escaped = false
                char == '\\' && inString -> escaped = true
                char == '"' -> inString = !inString
                !inString && char == '{' -> {
                    depth += 1
                    maxDepth = maxOf(maxDepth, depth)
                }
                !inString && char == '}' -> depth = maxOf(0, depth - 1)
            }
        }
        return maxDepth
    }
}

@Component
class GraphQlSecurityInterceptor(
    private val policy: GraphQlQueryPolicy = GraphQlQueryPolicy(),
) : WebGraphQlInterceptor {
    override fun intercept(
        request: WebGraphQlRequest,
        chain: WebGraphQlInterceptor.Chain,
    ): Mono<WebGraphQlResponse> {
        policy.validate(request.document)
        return chain.next(request)
    }
}
