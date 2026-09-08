package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

data class AuditChainHead(
    val eventHash: String,
    val recordCount: Long,
)

data class AuditAnchorRecord(
    val sequence: Long,
    val previousAnchorHash: String,
    val chainHead: String,
    val recordCount: Long,
    val anchoredAt: Instant,
    val sourceCommit: String,
    val anchorHash: String,
    val signature: String,
)

fun interface AuditChainHeadReader {
    fun current(): AuditChainHead?
}

fun interface AuditAnchorWriter {
    fun append(head: AuditChainHead, anchoredAt: Instant): AuditAnchorRecord
}
