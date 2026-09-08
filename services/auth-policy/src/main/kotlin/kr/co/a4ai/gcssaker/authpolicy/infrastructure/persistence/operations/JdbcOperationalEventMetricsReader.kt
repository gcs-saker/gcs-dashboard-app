package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper

class JdbcOperationalEventMetricsReader(
    private val jdbc: JdbcTemplate,
) {
    fun metricsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): OperationalEventMetrics {
        val aggregate = aggregateMetrics(principal, query)
        return aggregate.copy(
            severityCounts = severityCounts(principal, query),
            icePathCounts = icePathCounts(principal, query),
            streamSessions = streamSessions(principal, query),
        )
    }

    private fun aggregateMetrics(principal: AuthenticatedPrincipal, query: OperationalEventQuery): OperationalEventMetrics {
        val sql = StringBuilder(OperationalEventSql.selectMetricsBase)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query)
        return jdbc.queryForObject(sql.toString(), JdbcOperationalEventRowMappers.metrics, *params.toTypedArray())
            ?: OperationalEventMetrics.empty()
    }

    private fun severityCounts(principal: AuthenticatedPrincipal, query: OperationalEventQuery) =
        groupedCounts(
            principal = principal,
            query = query,
            baseSql = OperationalEventSql.selectSeverityCountsBase,
            groupSql = OperationalEventSql.groupBySeverity,
            mapper = JdbcOperationalEventRowMappers.severityCount,
        )

    private fun icePathCounts(principal: AuthenticatedPrincipal, query: OperationalEventQuery) =
        groupedCounts(
            principal = principal,
            query = query,
            baseSql = OperationalEventSql.selectIcePathCountsBase,
            preGroupSql = OperationalEventSql.andIcePathPresent,
            groupSql = OperationalEventSql.groupByIcePath,
            mapper = JdbcOperationalEventRowMappers.icePathCount,
        )

    private fun streamSessions(principal: AuthenticatedPrincipal, query: OperationalEventQuery) =
        groupedCounts(
            principal = principal,
            query = query,
            baseSql = OperationalEventSql.selectStreamSessionsBase,
            groupSql = OperationalEventSql.groupByStreamSession,
            mapper = JdbcOperationalEventRowMappers.streamSession,
        )

    private fun <T> groupedCounts(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        baseSql: String,
        preGroupSql: String = "",
        groupSql: String,
        mapper: RowMapper<T>,
    ): List<T> {
        val sql = StringBuilder(baseSql)
        val params = mutableListOf<Any>()
        OperationalEventFilterAppender.append(sql, params, principal, query)
        sql.append(preGroupSql)
        sql.append(groupSql)
        return jdbc.query(sql.toString(), mapper, *params.toTypedArray())
    }
}
