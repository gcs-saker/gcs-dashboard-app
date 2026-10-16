package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageUnavailableError
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

internal class JdbcTelemetryPageReader(dataSource: DataSource) {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = QUERY_TIMEOUT_SECONDS }

    fun read(principal: AuthenticatedPrincipal, query: TelemetryPageQuery): List<TelemetryReadModel> {
        val statement = TelemetryPageStatement.forPrincipal(principal, query)
        return try {
            jdbc.query(statement.sql, OperationalReadRowMappers.telemetry, *statement.parameters.toTypedArray())
        } catch (error: DataAccessException) {
            throw TelemetryPageUnavailableError(error)
        }
    }

    private companion object {
        const val QUERY_TIMEOUT_SECONDS = 3
    }
}
