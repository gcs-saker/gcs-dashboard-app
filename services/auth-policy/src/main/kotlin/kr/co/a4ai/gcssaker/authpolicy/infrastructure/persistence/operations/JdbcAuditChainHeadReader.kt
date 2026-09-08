package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHead
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHeadReader
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

class JdbcAuditChainHeadReader(dataSource: DataSource) : AuditChainHeadReader {
    private val jdbc = JdbcTemplate(dataSource)

    override fun current(): AuditChainHead? {
        val count = jdbc.queryForObject(COUNT_QUERY, Long::class.java) ?: 0
        if (count == 0L) return null
        val hash = jdbc.queryForObject(HEAD_QUERY, String::class.java) ?: return null
        return AuditChainHead(hash, count)
    }

    private companion object {
        const val COUNT_QUERY = """
            SELECT COUNT(*) FROM operational_events
            WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL
        """
        const val HEAD_QUERY = """
            SELECT event_hash FROM operational_events
            WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL
            ORDER BY occurred_at DESC, id DESC LIMIT 1
        """
    }
}
