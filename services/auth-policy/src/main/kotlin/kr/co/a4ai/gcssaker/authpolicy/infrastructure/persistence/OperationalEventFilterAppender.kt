package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import java.sql.Timestamp

internal object OperationalEventFilterAppender {
    fun append(
        sql: StringBuilder,
        params: MutableList<Any>,
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ) {
        params.add(principal.groupId.value)
        params.add(principal.role.name)
        params.add(UserRole.ADMIN.name)
        appendSeverity(sql, params, query)
        appendTimeRange(sql, params, query)
        appendTextQuery(sql, params, query)
    }

    private fun appendSeverity(
        sql: StringBuilder,
        params: MutableList<Any>,
        query: OperationalEventQuery,
    ) {
        if (!query.severity.isNullOrBlank()) {
            sql.append(OperationalEventSql.andSeverity)
            params.add(query.severity.lowercase())
        }
    }

    private fun appendTimeRange(
        sql: StringBuilder,
        params: MutableList<Any>,
        query: OperationalEventQuery,
    ) {
        query.from?.let {
            sql.append(OperationalEventSql.andOccurredAtFrom)
            params.add(Timestamp.from(it))
        }
        query.to?.let {
            sql.append(OperationalEventSql.andOccurredAtTo)
            params.add(Timestamp.from(it))
        }
    }

    private fun appendTextQuery(
        sql: StringBuilder,
        params: MutableList<Any>,
        query: OperationalEventQuery,
    ) {
        if (query.query.isNullOrBlank()) return
        val likeQuery = "%${query.query.trim().lowercase()}%"
        sql.append(OperationalEventSql.andTextQuery)
        repeat(TEXT_QUERY_COLUMN_COUNT) {
            params.add(likeQuery)
        }
    }

    private const val TEXT_QUERY_COLUMN_COUNT = 9
}
