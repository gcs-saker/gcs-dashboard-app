package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.RecoveryCodeStore
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

class JdbcRecoveryCodeStore(dataSource: DataSource) : RecoveryCodeStore {
    private val jdbc = JdbcTemplate(dataSource)

    override fun consume(codeHash: String): Boolean =
        try {
            jdbc.update("INSERT INTO admin_mfa_recovery_use (code_hash) VALUES (?)", codeHash) == 1
        } catch (_: DuplicateKeyException) {
            false
        }
}
