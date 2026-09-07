package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageReader
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageSnapshot
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditStorageStatus
import kr.co.a4ai.gcssaker.authpolicy.observability.AuditStorageMetrics
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

class AuditStorageMonitor(
    private val reader: AuditStorageReader,
    private val metrics: AuditStorageMetrics,
    private val limits: AuditStorageLimits,
) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val lastStatus = AtomicReference<AuditStorageStatus>()

    @Scheduled(fixedDelayString = "\${gcs.audit.storage.scan-millis:60000}")
    fun inspect() {
        try {
            val snapshot = reader.snapshot()
            val status = evaluate(snapshot)
            metrics.update(snapshot, status)
            if (lastStatus.getAndSet(status) != status) logStatus(status, snapshot.recordCount)
        } catch (error: RuntimeException) {
            logger.error("audit_storage_check_failed error_code=audit_storage_unavailable error_type={}", error.javaClass.simpleName)
        }
    }

    fun evaluate(snapshot: AuditStorageSnapshot): AuditStorageStatus {
        val capacityWarning = snapshot.recordCount >= limits.warningRecordCount
        val retentionWarning = exceedsAge(snapshot.oldestSecurityAt, snapshot, limits.securityRetention) ||
            exceedsAge(snapshot.oldestPrivilegedAt, snapshot, limits.privilegedRetention)
        return when {
            capacityWarning && retentionWarning -> AuditStorageStatus.CAPACITY_AND_RETENTION_WARNING
            capacityWarning -> AuditStorageStatus.CAPACITY_WARNING
            retentionWarning -> AuditStorageStatus.RETENTION_WARNING
            else -> AuditStorageStatus.NORMAL
        }
    }

    private fun exceedsAge(oldest: java.time.Instant?, snapshot: AuditStorageSnapshot, limit: Duration): Boolean =
        oldest?.let { Duration.between(it, snapshot.measuredAt) > limit } ?: false

    private fun logStatus(status: AuditStorageStatus, recordCount: Long) {
        if (status == AuditStorageStatus.NORMAL) {
            logger.info("audit_storage_status result=normal record_count={}", recordCount)
        } else {
            logger.warn("audit_storage_status result=warning error_code={} record_count={}", status.name.lowercase(), recordCount)
        }
    }
}

data class AuditStorageLimits(
    val warningRecordCount: Long,
    val securityRetention: Duration,
    val privilegedRetention: Duration,
) {
    init {
        require(warningRecordCount > 0)
        require(!securityRetention.isNegative && !securityRetention.isZero)
        require(!privilegedRetention.isNegative && !privilegedRetention.isZero)
    }
}
