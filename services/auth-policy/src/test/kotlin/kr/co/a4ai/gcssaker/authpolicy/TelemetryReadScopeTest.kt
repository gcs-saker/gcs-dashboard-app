package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TelemetryReadScopeTest {
    @Test
    fun `only own group operational roles receive a redundant group bound`() {
        for (role in UserRole.entries) {
            val expected = if (role in setOf(UserRole.VIEWER, UserRole.OPERATOR)) TelemetryReadScope.OWN_GROUP else TelemetryReadScope.POLICY_FILTERED
            assertEquals(expected, TelemetryReadScope.forRole(role))
        }
    }

    @Test
    fun `own scope never removes original policy and uses only authenticated group in every group slot`() {
        for (role in listOf(UserRole.VIEWER, UserRole.OPERATOR)) {
            val principal = AuthenticatedPrincipal("subject", role, GroupId("owned"))
            val statement = TelemetryPageStatement.forPrincipal(principal, TelemetryPageQuery(TelemetryPageSize(100), "position"))
            assertEquals(OperationalReadSql.selectTelemetryBase + OperationalReadSql.andTelemetryOwnGroup +
                OperationalReadSql.andTelemetryAfterUuid + OperationalReadSql.orderTelemetryPage, statement.sql)
            assertEquals(listOf("owned", role.name, "ADMIN", role.name, "owned", "owned", "position", 101), statement.parameters)
            assertEquals(statement.parameters.size, statement.sql.count { it == '?' })
        }
    }

    @Test
    fun `higher scope SQL and arguments remain byte identical to the old query`() {
        for (role in listOf(UserRole.ADMIN, UserRole.GROUP_ADMIN)) {
            val principal = AuthenticatedPrincipal("subject", role, GroupId("parent"))
            val statement = TelemetryPageStatement.forPrincipal(principal, TelemetryPageQuery(TelemetryPageSize(1), "position"))
            assertEquals(OperationalReadSql.selectTelemetryBase + OperationalReadSql.andTelemetryAfterUuid + OperationalReadSql.orderTelemetryPage, statement.sql)
            assertEquals(listOf("parent", role.name, "ADMIN", role.name, "parent", "position", 2), statement.parameters)
        }
    }

    @Test
    fun `first last and lookahead bounds are unchanged with and without a cursor`() {
        val principal = AuthenticatedPrincipal("subject", UserRole.VIEWER, GroupId("owned"))
        for (limit in listOf(1, 100, 500)) {
            for (position in listOf(null, "position")) {
                val statement = TelemetryPageStatement.forPrincipal(principal, TelemetryPageQuery(TelemetryPageSize(limit), position))
                assertEquals(limit + 1, statement.parameters.last())
                assertEquals(if (position == null) 7 else 8, statement.parameters.size)
                assertEquals(position != null, statement.sql.contains(OperationalReadSql.andTelemetryAfterUuid))
                assertFalse(statement.sql.contains("OFFSET"))
            }
        }
    }
}
