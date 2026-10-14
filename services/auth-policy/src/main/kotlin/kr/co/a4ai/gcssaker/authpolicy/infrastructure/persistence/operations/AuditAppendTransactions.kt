package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource
import io.micrometer.core.instrument.MeterRegistry

internal enum class AuditAppendOutcome { APPENDED, DUPLICATE }

enum class AuditAppendErrorCode(val value: String) {
    INCOMPLETE("audit_append_incomplete"), STORAGE_FAILED("audit_storage_failed"),
    LOCK_TIMEOUT("audit_lock_timeout"), INTERRUPTED("audit_append_interrupted"), HEAD_MISSING("audit_head_missing"),
}

class AuditAppendError(val errorCode: AuditAppendErrorCode, cause: Throwable? = null) : RuntimeException(errorCode.value, cause)

internal class AuditAppendTransactions(
    dataSource: DataSource,
    private val jdbc: JdbcTemplate,
    private val registry: MeterRegistry?,
) {
    private val transactions = TransactionTemplate(DataSourceTransactionManager(dataSource)).apply {
        timeout = TRANSACTION_TIMEOUT_SECONDS
    }
    private val isPostgres = dataSource.connection.use { it.metaData.databaseProductName == "PostgreSQL" }

    fun execute(work: () -> AuditAppendOutcome): AuditAppendOutcome {
        for (attempt in 0 until MAX_ATTEMPTS) {
            try {
                return transactions.execute {
                    if (isPostgres) {
                        jdbc.execute(LOCK_TIMEOUT_SQL)
                        jdbc.execute(STATEMENT_TIMEOUT_SQL)
                    }
                    work()
                } ?: throw AuditAppendError(AuditAppendErrorCode.INCOMPLETE)
            } catch (error: DataAccessException) {
                if (!isRetryableAuditLockFailure(error)) throw AuditAppendError(AuditAppendErrorCode.STORAGE_FAILED, error)
                if (attempt == MAX_ATTEMPTS - 1) throw AuditAppendError(AuditAppendErrorCode.LOCK_TIMEOUT, error)
                registry?.counter("gcs.auth_policy.audit.lock_retry")?.increment()
                backoff(attempt)
            }
        }
        throw AuditAppendError(AuditAppendErrorCode.INCOMPLETE)
    }

    private fun backoff(attempt: Int) {
        try {
            Thread.sleep(INITIAL_BACKOFF_MILLIS shl attempt)
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
            throw AuditAppendError(AuditAppendErrorCode.INTERRUPTED, error)
        }
    }

    companion object {
        const val TRANSACTION_TIMEOUT_SECONDS = 3
        private const val MAX_ATTEMPTS = 3
        private const val INITIAL_BACKOFF_MILLIS = 50L
        private const val LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '500ms'"
        private const val STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout = '2s'"
    }
}
