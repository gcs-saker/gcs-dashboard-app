package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.h2.jdbcx.JdbcDataSource
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.dao.PessimisticLockingFailureException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.TransactionSystemException
import java.sql.SQLException

class GroupHierarchyTransactionsTest {
    private val source = JdbcDataSource().apply { setURL("jdbc:h2:mem:hierarchy-retry-${System.nanoTime()};DB_CLOSE_DELAY=-1") }
    private val jdbc = JdbcTemplate(source).apply { queryTimeout = 3 }

    @Test
    fun `recognized serialization retries roll back before bounded exponential pauses`() {
        jdbc.execute("CREATE TABLE probe (id INT PRIMARY KEY)")
        val pauses = mutableListOf<Long>()
        val transactions = GroupHierarchyTransactions(source, jdbc) { pauses.add(it) }
        var calls = 0
        transactions.execute(GroupHierarchyOperation.UPDATE) {
            calls += 1
            jdbc.update("INSERT INTO probe VALUES (1)")
            if (calls < 3) throw PessimisticLockingFailureException("private SQL", SQLException("private", "40001"))
            "complete"
        }
        assertEquals(3, calls)
        assertEquals(listOf(50L, 100L), pauses)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM probe", Int::class.java))
    }

    @Test
    fun `commit wrappers are classified but permanent storage and domain errors are not retried`() {
        var calls = 0
        val transactions = GroupHierarchyTransactions(source, jdbc) { }
        transactions.execute(GroupHierarchyOperation.UPDATE) {
            calls += 1
            if (calls == 1) throw TransactionSystemException("commit", SQLException("private", "40001"))
            Unit
        }
        assertEquals(2, calls)
        calls = 0
        assertThrows<GroupHierarchyStorageError> { transactions.execute<Unit>(GroupHierarchyOperation.UPDATE) {
            calls += 1
            throw DataAccessResourceFailureException("private host", SQLException("private", "08006"))
        } }
        assertEquals(1, calls)
        assertThrows<StateConflictError> { transactions.execute<Unit>(GroupHierarchyOperation.CREATE) { throw DataIntegrityViolationException("private SQL") } }
        assertThrows<InvalidContractError> { transactions.execute<Unit>(GroupHierarchyOperation.CREATE) { throw InvalidContractError("invalid", "invalid") } }
    }

    @Test
    fun `retry exhaustion and thread interruption preserve typed failure without leaking causes`() {
        val transactions = GroupHierarchyTransactions(source, jdbc) { }
        var calls = 0
        val exhausted = assertThrows<GroupHierarchyStorageError> { transactions.execute<Unit>(GroupHierarchyOperation.UPDATE) {
            calls += 1
            throw PessimisticLockingFailureException("private", SQLException("private", "40001"))
        } }
        assertEquals(3, calls)
        assertEquals(GroupHierarchyErrorCode.CONTENDED, exhausted.errorCode)
        try {
            val interrupted = GroupHierarchyTransactions(source, jdbc) { throw InterruptedException("private") }
            assertEquals(GroupHierarchyErrorCode.INTERRUPTED, assertThrows<GroupHierarchyStorageError> {
                interrupted.execute<Unit>(GroupHierarchyOperation.UPDATE) { throw PessimisticLockingFailureException("private") }
            }.errorCode)
            assertTrue(Thread.currentThread().isInterrupted)
        } finally {
            Thread.interrupted()
        }
    }

    @Test
    fun `storage errors map to stable unavailable responses without SQL hosts or credentials`() {
        val detail = kr.co.a4ai.gcssaker.authpolicy.api.ApiExceptionHandler().groupHierarchyError(
            GroupHierarchyStorageError(GroupHierarchyErrorCode.UNAVAILABLE, SQLException("private-host private-secret")),
            org.springframework.mock.web.MockHttpServletRequest(),
        )
        assertEquals(503, detail.status)
        assertEquals("group hierarchy storage is unavailable", detail.detail)
        assertEquals("group_hierarchy_unavailable", detail.properties?.get("code"))
    }
}
