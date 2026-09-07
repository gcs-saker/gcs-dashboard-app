package kr.co.a4ai.gcssaker.authpolicy.application

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageReader
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageSnapshot
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class AuditStorageMonitorTest {
    private val now = Instant.parse("2026-09-07T00:00:00Z")
    private val limits = AuditStorageLimits(80, Duration.ofDays(365), Duration.ofDays(730))

    @Test
    fun `monitor distinguishes capacity retention and combined warnings`() {
        val monitor = monitor(snapshot(0))

        assertEquals(AuditStorageStatus.NORMAL, monitor.evaluate(snapshot(79)))
        assertEquals(AuditStorageStatus.CAPACITY_WARNING, monitor.evaluate(snapshot(80)))
        assertEquals(
            AuditStorageStatus.RETENTION_WARNING,
            monitor.evaluate(snapshot(1, securityAgeDays = 366)),
        )
        assertEquals(
            AuditStorageStatus.CAPACITY_AND_RETENTION_WARNING,
            monitor.evaluate(snapshot(80, privilegedAgeDays = 731)),
        )
    }

    @Test
    fun `inspection exports low cardinality gauges without record identifiers`() {
        val registry = SimpleMeterRegistry()
        val snapshot = snapshot(80, securityAgeDays = 366)
        AuditStorageMonitor({ snapshot }, AuditStorageMetrics(registry), limits).inspect()

        assertEquals(80.0, registry.get("gcs.auth_policy.audit.storage.records").gauge().value())
        assertEquals(1.0, registry.get("gcs.auth_policy.audit.storage.warning").gauge().value())
        assertEquals(366.0 * 86_400, registry.get("gcs.auth_policy.audit.storage.security_age_seconds").gauge().value())
    }

    private fun monitor(snapshot: AuditStorageSnapshot) =
        AuditStorageMonitor(AuditStorageReader { snapshot }, AuditStorageMetrics(SimpleMeterRegistry()), limits)

    private fun snapshot(
        count: Long,
        securityAgeDays: Long? = null,
        privilegedAgeDays: Long? = null,
    ) = AuditStorageSnapshot(
        count,
        securityAgeDays?.let { now.minus(Duration.ofDays(it)) },
        privilegedAgeDays?.let { now.minus(Duration.ofDays(it)) },
        now,
    )
}
