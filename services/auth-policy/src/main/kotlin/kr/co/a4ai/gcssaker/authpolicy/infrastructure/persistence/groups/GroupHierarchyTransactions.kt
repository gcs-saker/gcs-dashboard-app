package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

internal enum class GroupHierarchyOperation { INITIALIZE, CREATE, UPDATE }

internal class GroupHierarchyTransactions(
    source: DataSource, private val jdbc: JdbcTemplate, private val pause: (Long) -> Unit = Thread::sleep,
) {
    private val logger = LoggerFactory.getLogger("gcs.group_hierarchy")
    private val postgres = source.connection.use { it.metaData.databaseProductName.equals("PostgreSQL", true) }
    private val transactions = TransactionTemplate(DataSourceTransactionManager(source)).apply {
        timeout = TRANSACTION_TIMEOUT_SECONDS
        isolationLevel = TransactionDefinition.ISOLATION_SERIALIZABLE
    }

    fun <T : Any> execute(operation: GroupHierarchyOperation, work: () -> T): T {
        val started = System.nanoTime()
        try {
            val result = attempts(work)
            log(operation, "success", "none", started)
            return result
        } catch (error: PolicyContractError) {
            log(operation, "rejected", error.code, started)
            throw error
        } catch (error: GroupHierarchyStorageError) {
            log(operation, "failed", error.errorCode.value, started)
            throw error
        }
    }

    private fun <T : Any> attempts(work: () -> T): T {
        for (attempt in 0 until MAX_ATTEMPTS) {
            try {
                return transactions.execute {
                    prepareTransaction()
                    work()
                } ?: throw GroupHierarchyStorageError(GroupHierarchyErrorCode.INCOMPLETE)
            } catch (error: DataAccessException) {
                retryOrThrow(error, attempt)
            } catch (error: TransactionException) {
                retryOrThrow(error, attempt)
            }
        }
        throw GroupHierarchyStorageError(GroupHierarchyErrorCode.INCOMPLETE)
    }

    private fun prepareTransaction() {
        if (!postgres) return
        jdbc.execute(LOCK_TIMEOUT_SQL)
        jdbc.execute(STATEMENT_TIMEOUT_SQL)
        // Only hierarchy writers share this transaction-scoped lock; media/telemetry do not acquire it.
        jdbc.execute(HIERARCHY_LOCK_SQL)
    }

    private fun retryOrThrow(error: Throwable, attempt: Int) {
        if (error is DataIntegrityViolationException) {
            throw StateConflictError("group_hierarchy_conflict", "group hierarchy conflicts with current state")
        }
        if (!isRetryableDatabaseTransactionFailure(error)) throw GroupHierarchyStorageError(GroupHierarchyErrorCode.UNAVAILABLE, error)
        if (attempt == MAX_ATTEMPTS - 1) throw GroupHierarchyStorageError(GroupHierarchyErrorCode.CONTENDED, error)
        try {
            pause(INITIAL_BACKOFF_MILLIS shl attempt)
        } catch (interrupted: InterruptedException) {
            Thread.currentThread().interrupt()
            throw GroupHierarchyStorageError(GroupHierarchyErrorCode.INTERRUPTED, interrupted)
        }
    }

    private fun log(operation: GroupHierarchyOperation, result: String, code: String, started: Long) {
        logger.info("group_hierarchy operation={} result={} duration_ms={} code={}",
            operation.name.lowercase(), result, (System.nanoTime() - started) / NANOS_PER_MILLISECOND, code)
    }

    companion object {
        const val TRANSACTION_TIMEOUT_SECONDS = 3
        private const val MAX_ATTEMPTS = 3
        private const val INITIAL_BACKOFF_MILLIS = 50L
        private const val NANOS_PER_MILLISECOND = 1_000_000
        private const val LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '500ms'"
        private const val STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout = '2s'"
        private const val HIERARCHY_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended('gcs.auth-policy.hierarchy.v1', 0))"
    }
}
