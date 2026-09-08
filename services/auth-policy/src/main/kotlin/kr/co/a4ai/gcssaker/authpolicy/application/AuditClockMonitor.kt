package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditClockEvidence
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditClockEvidenceProvider
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditClockStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpTimeProbe
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncMode
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.absoluteValue

class AuditClockState : AuditClockEvidenceProvider {
    private val evidence = AtomicReference(AuditClockEvidence.unknown())
    override fun current(): AuditClockEvidence = evidence.get()
    fun update(next: AuditClockEvidence) = evidence.set(next)
}

class AuditClockMonitor(
    private val configs: TimeSyncConfigRepository,
    private val probe: NtpTimeProbe,
    private val state: AuditClockState,
    private val now: () -> Instant = Instant::now,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${gcs.audit.clock.scan-millis:60000}")
    fun refresh(): AuditClockEvidence {
        val config = configs.current()
        val evidence = if (config.mode == TimeSyncMode.MANUAL || config.sourceHost.isNullOrBlank()) {
            AuditClockEvidence.unknown(now(), "${config.mode.name.lowercase()}-unverified")
        } else {
            measuredEvidence(config)
        }
        state.update(evidence)
        logEvidence(evidence)
        return evidence
    }

    private fun measuredEvidence(config: TimeSyncConfig): AuditClockEvidence = try {
        val measurement = probe.measure(config.sourceHost!!, config.sourcePort, PROBE_TIMEOUT)
        val driftMs = measurement.offset.toMillis()
        val trust = if (measurement.authenticated) "ntp-authenticated" else "ntp-unauthenticated"
        AuditClockEvidence(
            classify(driftMs, config.driftWarnMs),
            "$trust:${measurement.source.take(128)}",
            driftMs,
            measurement.measuredAt,
        )
    } catch (error: RuntimeException) {
        logger.warn("clock_probe_failed error_code=ntp_probe_failed error_type={}", error.javaClass.simpleName)
        AuditClockEvidence.unknown(now(), "ntp-unreachable")
    }

    private fun classify(driftMs: Long, warningMs: Long): AuditClockStatus = when {
        driftMs.absoluteValue <= warningMs -> AuditClockStatus.NORMAL
        driftMs.absoluteValue <= warningMs * UNSAFE_MULTIPLIER -> AuditClockStatus.WARNING
        else -> AuditClockStatus.UNSAFE
    }

    private fun logEvidence(evidence: AuditClockEvidence) {
        logger.info(
            "clock_evidence status={} drift_ms={} source={} measured_at={}",
            evidence.status, evidence.clockDriftMs, evidence.timeSource, evidence.measuredAt,
        )
    }

    private companion object {
        val PROBE_TIMEOUT: Duration = Duration.ofSeconds(2)
        const val UNSAFE_MULTIPLIER = 5
    }
}
