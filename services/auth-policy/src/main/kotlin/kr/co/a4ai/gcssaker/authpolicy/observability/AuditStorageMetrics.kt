package kr.co.a4ai.gcssaker.authpolicy.observability

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageSnapshot
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageStatus
import java.time.Duration
import java.util.concurrent.atomic.AtomicLong

class AuditStorageMetrics(registry: MeterRegistry) {
    private val records = AtomicLong()
    private val securityAgeSeconds = AtomicLong()
    private val privilegedAgeSeconds = AtomicLong()
    private val warning = AtomicLong()

    init {
        register(registry, "gcs.auth_policy.audit.storage.records", records)
        register(registry, "gcs.auth_policy.audit.storage.security_age_seconds", securityAgeSeconds)
        register(registry, "gcs.auth_policy.audit.storage.privileged_age_seconds", privilegedAgeSeconds)
        register(registry, "gcs.auth_policy.audit.storage.warning", warning)
    }

    fun update(snapshot: AuditStorageSnapshot, status: AuditStorageStatus) {
        records.set(snapshot.recordCount)
        securityAgeSeconds.set(ageSeconds(snapshot.oldestSecurityAt, snapshot))
        privilegedAgeSeconds.set(ageSeconds(snapshot.oldestPrivilegedAt, snapshot))
        warning.set(if (status == AuditStorageStatus.NORMAL) 0 else 1)
    }

    private fun ageSeconds(oldest: java.time.Instant?, snapshot: AuditStorageSnapshot): Long =
        oldest?.let { Duration.between(it, snapshot.measuredAt).seconds.coerceAtLeast(0) } ?: 0

    private fun register(registry: MeterRegistry, name: String, value: AtomicLong) {
        Gauge.builder(name, value) { it.get().toDouble() }.register(registry)
    }
}
