package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadScope
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole

internal class TelemetryPageStatement(val sql: String, val parameters: List<Any>) {
    companion object {
        fun forPrincipal(principal: AuthenticatedPrincipal, query: TelemetryPageQuery): TelemetryPageStatement {
            val sql = StringBuilder(OperationalReadSql.selectTelemetryBase)
            val parameters = mutableListOf<Any>(principal.groupId.value, principal.role.name, UserRole.ADMIN.name,
                principal.role.name, principal.groupId.value)
            if (TelemetryReadScope.forRole(principal.role) == TelemetryReadScope.OWN_GROUP) {
                // Retain the complete original policy filter; the redundant bound exposes (group_id, uuid) to generic plans.
                sql.append(OperationalReadSql.andTelemetryOwnGroup)
                parameters.add(principal.groupId.value)
            }
            query.afterUuid?.let { sql.append(OperationalReadSql.andTelemetryAfterUuid); parameters.add(it) }
            sql.append(OperationalReadSql.orderTelemetryPage)
            parameters.add(query.size.fetchLimit)
            return TelemetryPageStatement(sql.toString(), parameters)
        }
    }
}
