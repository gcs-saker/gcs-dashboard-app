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

    fun appendIfAbsent(event: OperationalEventReadModel) {
        if (!existsById(event.id)) {
            insert(event)
        }
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
        )
    }

    private fun existsById(id: String): Boolean =
        (jdbc.queryForObject(OperationalEventSql.existsById, Int::class.java, id) ?: 0) > 0
}
