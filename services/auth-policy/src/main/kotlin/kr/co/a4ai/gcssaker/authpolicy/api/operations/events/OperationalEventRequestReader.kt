package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole

data class OperationalEventRequestContext(
    val principal: AuthenticatedPrincipal,
    val query: OperationalEventQuery,
)

class OperationalEventRequestReader(
    private val principalResolver: BearerPrincipalResolver,
) {
    fun context(
        authorization: String?,
        query: String?,
        severity: String?,
        from: String?,
        to: String?,
    ): OperationalEventRequestContext {
        val principal = principalResolver.requirePrincipal(authorization)
        if (principal.role != UserRole.ADMIN) throw ForbiddenApiError("system administrator required")
        return OperationalEventRequestContext(
            principal = principal,
            query = OperationalEventQueryParser.parse(query, severity, from, to),
        )
    }

    fun pageQuery(
        filter: OperationalEventQuery,
        limit: Int?,
        after: String?,
    ): OperationalEventPageQuery =
        OperationalEventPageQuery(
            filter = filter,
            limit = OperationalEventPageLimit.from(limit),
            after = OperationalEventCursor.decode(after),
        )
}
