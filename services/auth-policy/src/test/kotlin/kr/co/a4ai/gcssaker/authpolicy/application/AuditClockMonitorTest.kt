package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditClockStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryTimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpMeasurement
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpTimeProbe
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpProbeError
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncMode
import kr.co.a4ai.gcssaker.authpolicy.domain.UpdateTimeSyncConfigCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class AuditClockMonitorTest {
    private val now = Instant.parse("2026-09-08T00:00:00Z")

    @Test
    fun `monitor classifies normal warning and unsafe absolute drift`() {
        val repository = repository(1_000)
        assertEquals(AuditClockStatus.NORMAL, monitor(repository, 1_000).refresh().status)
        assertEquals(AuditClockStatus.WARNING, monitor(repository, -1_001).refresh().status)
        assertEquals(AuditClockStatus.UNSAFE, monitor(repository, 5_001).refresh().status)
    }

    @Test
    fun `probe failure and manual mode remain unknown`() {
        val state = AuditClockState()
        val failure = AuditClockMonitor(
            repository(1_000), NtpTimeProbe { _, _, _ -> throw NtpProbeError("offline") }, state,
        ) { now }
        assertEquals(AuditClockStatus.UNKNOWN, failure.refresh().status)
        assertEquals("ntp-unreachable", state.current().timeSource)

        val manual = repository(1_000).also {
            it.update(
                UpdateTimeSyncConfigCommand("manual", null, null, null),
                AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a")), now,
            )
        }
        assertEquals(AuditClockStatus.UNKNOWN, monitor(manual, 0).refresh().status)
    }

    private fun monitor(repository: InMemoryTimeSyncConfigRepository, driftMs: Long): AuditClockMonitor {
        val probe = NtpTimeProbe { host, port, _ ->
            NtpMeasurement("$host:$port", Duration.ofMillis(driftMs), now, authenticated = false)
        }
        return AuditClockMonitor(repository, probe, AuditClockState()) { now }
    }

    private fun repository(warnMs: Long) = InMemoryTimeSyncConfigRepository(
        TimeSyncConfig(TimeSyncMode.PUBLIC, "time.test", 123, warnMs, Instant.EPOCH, "system"),
    )
}
