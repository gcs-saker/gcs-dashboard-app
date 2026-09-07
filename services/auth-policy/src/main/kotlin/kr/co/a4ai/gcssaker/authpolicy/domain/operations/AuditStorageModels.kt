package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

data class AuditStorageSnapshot(
    val recordCount: Long,
    val oldestSecurityAt: Instant?,
    val oldestPrivilegedAt: Instant?,
    val measuredAt: Instant,
)

fun interface AuditStorageReader {
    fun snapshot(): AuditStorageSnapshot
}

enum class AuditStorageStatus {
    NORMAL,
    CAPACITY_WARNING,
    RETENTION_WARNING,
    CAPACITY_AND_RETENTION_WARNING,
}
