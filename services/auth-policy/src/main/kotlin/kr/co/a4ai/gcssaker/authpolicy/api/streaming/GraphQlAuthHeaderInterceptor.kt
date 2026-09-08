package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.graphql.server.WebGraphQlInterceptor
import org.springframework.graphql.server.WebGraphQlRequest
import org.springframework.graphql.server.WebGraphQlResponse
import org.springframework.stereotype.Component
import reactor.core.publisher.Mono

@Component
class GraphQlAuthHeaderInterceptor : WebGraphQlInterceptor {
    override fun intercept(
        request: WebGraphQlRequest,
        chain: WebGraphQlInterceptor.Chain,
    ): Mono<WebGraphQlResponse> {
        request.headers.getFirst(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME)?.let { authorization ->
            request.configureExecutionInput { _, builder ->
                builder.graphQLContext(
                    mapOf(GraphQlContextKeys.AUTHORIZATION_HEADER to authorization),
                ).build()
            }
        }
        return chain.next(request)
    }
}
