package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration
import java.time.Instant

enum class AuditClockStatus {
    NORMAL,
    WARNING,
    UNSAFE,
    UNKNOWN,
}

data class AuditClockEvidence(
    val status: AuditClockStatus,
    val timeSource: String,
    val clockDriftMs: Long?,
    val measuredAt: Instant,
) {
    companion object {
        fun unknown(measuredAt: Instant = Instant.EPOCH, source: String = "unverified") =
            AuditClockEvidence(AuditClockStatus.UNKNOWN, source, null, measuredAt)
    }
}

data class NtpMeasurement(
    val source: String,
    val offset: Duration,
    val measuredAt: Instant,
    val authenticated: Boolean,
)

fun interface AuditClockEvidenceProvider {
    fun current(): AuditClockEvidence
}

fun interface NtpTimeProbe {
    fun measure(host: String, port: Int, timeout: Duration): NtpMeasurement
}
