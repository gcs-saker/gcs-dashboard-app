package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.dao.DataAccessException
internal fun isRetryableAuditLockFailure(error: DataAccessException): Boolean =
    isRetryableDatabaseTransactionFailure(error)
