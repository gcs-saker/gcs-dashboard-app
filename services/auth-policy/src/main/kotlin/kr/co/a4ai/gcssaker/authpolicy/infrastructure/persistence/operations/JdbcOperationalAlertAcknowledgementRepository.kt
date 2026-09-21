package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgement
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgementRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.sql.Timestamp

@Repository
class JdbcOperationalAlertAcknowledgementRepository(private val jdbc: JdbcTemplate) : OperationalAlertAcknowledgementRepository {
    override fun save(value: OperationalAlertAcknowledgement): OperationalAlertAcknowledgement {
        jdbc.update(
            """
            INSERT INTO operational_alert_acknowledgements (runbook_id, state, updated_by, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (runbook_id) DO UPDATE SET state = EXCLUDED.state, updated_by = EXCLUDED.updated_by,
                updated_at = EXCLUDED.updated_at
            """.trimIndent(),
            value.runbookId, value.state, value.updatedBy, Timestamp.from(value.updatedAt),
        )
        return value
    }

    override fun list(): List<OperationalAlertAcknowledgement> = jdbc.query(
        "SELECT runbook_id, state, updated_by, updated_at FROM operational_alert_acknowledgements ORDER BY runbook_id",
        { rs, _ -> rs.toAcknowledgement() },
    )

    private fun ResultSet.toAcknowledgement() = OperationalAlertAcknowledgement(
        runbookId = getString("runbook_id"), state = getString("state"), updatedBy = getString("updated_by"),
        updatedAt = getTimestamp("updated_at").toInstant(),
    )
}
