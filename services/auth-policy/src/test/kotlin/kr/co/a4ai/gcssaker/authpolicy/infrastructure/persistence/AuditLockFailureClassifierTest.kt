package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.dao.PessimisticLockingFailureException
import java.sql.SQLException

class AuditLockFailureClassifierTest {
    @ParameterizedTest
    @ValueSource(strings = ["55P03", "40P01", "40001"])
    fun `lock deadlock and serialization sqlstates permit bounded idempotent retry`(sqlState: String) {
        assertTrue(isRetryableAuditLockFailure(DataAccessResourceFailureException("test", SQLException("test", sqlState))))
    }

    @ParameterizedTest
    @ValueSource(strings = ["23505", "23514", "08006", "57014"])
    fun `integrity connection and generic query failures must not retry`(sqlState: String) {
        assertFalse(isRetryableAuditLockFailure(DataAccessResourceFailureException("test", SQLException("test", sqlState))))
    }

    @Test
    fun `translated lock exceptions work without driver causes and cause traversal is bounded`() {
        assertTrue(isRetryableAuditLockFailure(PessimisticLockingFailureException("test")))
        var nested: Throwable = SQLException("test", "55P03")
        repeat(10) { nested = IllegalStateException("test", nested) }
        assertFalse(isRetryableAuditLockFailure(DataAccessResourceFailureException("test", nested)))
    }
}
