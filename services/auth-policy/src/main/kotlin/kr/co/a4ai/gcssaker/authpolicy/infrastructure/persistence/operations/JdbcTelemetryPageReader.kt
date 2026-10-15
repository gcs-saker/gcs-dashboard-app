package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageUnavailableError
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

internal class JdbcTelemetryPageReader(dataSource: DataSource) {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = QUERY_TIMEOUT_SECONDS }

    fun read(principal: AuthenticatedPrincipal, query: TelemetryPageQuery): List<TelemetryReadModel> {
        val sql = StringBuilder(OperationalReadSql.selectTelemetryBase)
        val parameters = mutableListOf<Any>(principal.groupId.value, principal.role.name, UserRole.ADMIN.name,
            principal.role.name, principal.groupId.value)
        query.afterUuid?.let { sql.append(OperationalReadSql.andTelemetryAfterUuid); parameters.add(it) }
        sql.append(OperationalReadSql.orderTelemetryPage)
        parameters.add(query.size.fetchLimit)
        return try {
            jdbc.query(sql.toString(), OperationalReadRowMappers.telemetry, *parameters.toTypedArray())
        } catch (error: DataAccessException) {
            throw TelemetryPageUnavailableError(error)
        }
    }

    private companion object {
        const val QUERY_TIMEOUT_SECONDS = 3
    }
}
