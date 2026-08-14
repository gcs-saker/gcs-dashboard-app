package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal

internal class OperationalReadRequestReader(
    private val principalResolver: BearerPrincipalResolver,
) {
    fun principal(authorization: String?): AuthenticatedPrincipal =
        principalResolver.requirePrincipal(authorization)

    fun boundedLimit(limit: Int?): Int =
        OperationalReadQueryPolicy.normalizeLimit(limit)
}
