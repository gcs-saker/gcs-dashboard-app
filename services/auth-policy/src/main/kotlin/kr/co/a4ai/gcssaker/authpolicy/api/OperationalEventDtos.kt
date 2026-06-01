package kr.co.a4ai.gcssaker.authpolicy.api

import java.time.Instant

data class OperationalEventResponse(
    val id: String,
    val occurredAt: Instant,
    val severity: String,
    val category: String,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
)
