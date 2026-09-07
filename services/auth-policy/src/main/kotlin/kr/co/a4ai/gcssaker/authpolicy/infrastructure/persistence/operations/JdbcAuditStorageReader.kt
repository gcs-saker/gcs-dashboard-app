package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageReader
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageSnapshot
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant
import javax.sql.DataSource

class JdbcAuditStorageReader(
    dataSource: DataSource,
    private val now: () -> Instant = Instant::now,
) : AuditStorageReader {
    private val jdbc = JdbcTemplate(dataSource)

    override fun snapshot(): AuditStorageSnapshot = jdbc.queryForObject(QUERY) { result, _ ->
        AuditStorageSnapshot(
            recordCount = result.getLong("record_count"),
            oldestSecurityAt = result.getTimestamp("oldest_security_at")?.toInstant(),
            oldestPrivilegedAt = result.getTimestamp("oldest_privileged_at")?.toInstant(),
            measuredAt = now(),
        )
    } ?: AuditStorageSnapshot(0, null, null, now())

    private companion object {
        const val QUERY = """
            SELECT COUNT(*) AS record_count,
                   MIN(CASE WHEN category = 'security' THEN occurred_at END) AS oldest_security_at,
                   MIN(CASE WHEN category = 'audit' THEN occurred_at END) AS oldest_privileged_at
            FROM operational_events
            WHERE category IN ('security', 'audit')
        """
    }
}
