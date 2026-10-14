package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.dao.DataAccessException
import org.springframework.dao.PessimisticLockingFailureException
import java.sql.SQLException

private const val MAX_ERROR_CAUSE_DEPTH = 8
private val RETRYABLE_SQL_STATES = setOf("55P03", "40P01", "40001")

internal fun isRetryableAuditLockFailure(error: DataAccessException): Boolean =
    error is PessimisticLockingFailureException || generateSequence<Throwable>(error) { it.cause }
        .take(MAX_ERROR_CAUSE_DEPTH).filterIsInstance<SQLException>()
        .any { it.sqlState in RETRYABLE_SQL_STATES }
