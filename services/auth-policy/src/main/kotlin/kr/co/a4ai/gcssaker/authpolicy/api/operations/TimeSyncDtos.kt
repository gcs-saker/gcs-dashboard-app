package kr.co.a4ai.gcssaker.authpolicy.api

import java.time.Instant

data class TimeSyncConfigRequest(
    val mode: String,
    val sourceHost: String? = null,
    val sourcePort: Int? = null,
    val driftWarnMs: Long? = null,
)

data class TimeSyncStatusResponse(
    val mode: String,
    val sourceHost: String?,
    val sourcePort: Int,
    val driftWarnMs: Long,
    val updatedAt: Instant,
    val updatedBy: String,
    val serverTime: Instant,
    val monotonicMs: Long,
    val timezone: String,
    val checkedAt: Instant,
    val health: String,
    val message: String,
)
