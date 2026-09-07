package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class AuditHashChainTest {
    @Test
    fun `verification detects mutation of a chained audit event`() {
        val chained = AuditHashChain.chain(auditEvent(), AuditHashChain.GENESIS_HASH)

        assertTrue(AuditHashChain.verify(chained))
        assertFalse(AuditHashChain.verify(chained.copy(message = "tampered")))
        assertFalse(AuditHashChain.verify(chained.copy(actorId = "different")))
    }

    private fun auditEvent() = OperationalEventReadModel(
        id = "audit-1",
        occurredAt = Instant.parse("2026-09-07T00:00:00Z"),
        severity = "warn",
        category = "security",
        eventType = "auth.login.failed",
        sourceService = "auth-policy",
        source = "security-audit",
        message = "login denied",
        connections = 0,
        latencyMs = 0,
        throughputMbps = 0.0,
        groupId = GroupId("security"),
        traceId = "trace-1",
        actorId = "u***n",
        operation = "auth.login.failed",
        result = "denied",
        errorCode = "auth.login.failed",
        clockStatus = "unverified",
    )
}
