package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHead
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHeadReader
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

class JdbcAuditChainHeadReader(dataSource: DataSource) : AuditChainHeadReader {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = AuditAppendTransactions.TRANSACTION_TIMEOUT_SECONDS }

    override fun current(): AuditChainHead? {
        return jdbc.query(HEAD_QUERY) { rs, _ ->
            AuditChainHead(rs.getString("last_hash"), rs.getLong("event_count"))
        }.firstOrNull()?.takeIf { it.recordCount > 0 }
    }

    private companion object {
        const val HEAD_QUERY = """
            SELECT last_hash, event_count FROM operational_audit_chain_head WHERE singleton = 1
        """
    }
}
