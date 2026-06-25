package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcSchemaTypes
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.OperationalEventSql
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.OperationalReadSql
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class JdbcPostgresSchemaContractTest {
    @Test
    fun `jdbc create table statements use postgres compatible float type`() {
        val createTableStatements = listOf(
            OperationalEventSql.createTable,
            OperationalReadSql.createTelemetryTable,
            OperationalReadSql.createTelemetryHistoryTable,
        )

        createTableStatements.forEach { statement ->
            assertFalse(postgresInvalidDoubleType.containsMatchIn(statement))
        }
        assertTrue(createTableStatements.all { statement -> JdbcSchemaTypes.float64 in statement })
    }

    private companion object {
        val postgresInvalidDoubleType = Regex("\\bDOUBLE\\s+NOT\\s+NULL\\b", RegexOption.IGNORE_CASE)
    }
}
