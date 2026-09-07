package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp

class JdbcOperationalEventWriter(
    private val jdbc: JdbcTemplate,
) {
    fun seed(initialEvents: Collection<OperationalEventReadModel>) {
        initialEvents.forEach(::appendIfAbsent)
    }

    @Synchronized
    fun appendIfAbsent(event: OperationalEventReadModel) {
        if (!existsById(event.id)) {
            insert(withAuditChain(event))
        }
    }

    private fun withAuditChain(event: OperationalEventReadModel): OperationalEventReadModel {
        if (!AuditHashChain.isAudit(event)) return event
        val previousHash = jdbc.query(OperationalEventSql.latestAuditHash) { rs, _ -> rs.getString(1) }
            .firstOrNull() ?: AuditHashChain.GENESIS_HASH
        return AuditHashChain.chain(event, previousHash)
    }

    private fun insert(event: OperationalEventReadModel) {
        jdbc.update(
            OperationalEventSql.insert,
            event.id,
            Timestamp.from(event.occurredAt),
            event.severity.lowercase(),
            event.category,
            event.eventType,
            event.sourceService,
            event.source,
            event.message,
            event.connections,
            event.latencyMs,
            event.throughputMbps,
            event.groupId.value,
            event.streamId,
            event.connectionId,
            event.icePath,
            event.relayFallbackReason,
            event.traceId,
            event.actorId,
            event.operation,
            event.result,
            event.errorCode,
            event.clockStatus,
            event.previousHash,
            event.eventHash,
        )
    }

    private fun existsById(id: String): Boolean =
        (jdbc.queryForObject(OperationalEventSql.existsById, Int::class.java, id) ?: 0) > 0
}
