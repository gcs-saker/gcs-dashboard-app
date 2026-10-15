package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.dao.PessimisticLockingFailureException
import java.sql.SQLException

private const val MAX_TRANSACTION_CAUSE_DEPTH = 8
private val RETRYABLE_TRANSACTION_SQL_STATES = setOf("55P03", "40P01", "40001")

internal fun isRetryableDatabaseTransactionFailure(error: Throwable): Boolean =
    error is PessimisticLockingFailureException || generateSequence(error) { it.cause }
        .take(MAX_TRANSACTION_CAUSE_DEPTH).filterIsInstance<SQLException>()
        .any { it.sqlState in RETRYABLE_TRANSACTION_SQL_STATES }
