package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal object AuditHashChain {
    val GENESIS_HASH = "0".repeat(64)
    private val auditCategories = setOf("security", "audit")

    fun isAudit(event: OperationalEventReadModel): Boolean = event.category in auditCategories

    fun chain(event: OperationalEventReadModel, previousHash: String): OperationalEventReadModel =
        event.copy(previousHash = previousHash, eventHash = digest(canonical(event, previousHash)))

    fun verify(event: OperationalEventReadModel): Boolean {
        val previousHash = event.previousHash ?: return false
        val eventHash = event.eventHash ?: return false
        return MessageDigest.isEqual(
            eventHash.toByteArray(StandardCharsets.US_ASCII),
            digest(canonical(event, previousHash)).toByteArray(StandardCharsets.US_ASCII),
        )
    }

    private fun canonical(event: OperationalEventReadModel, previousHash: String): String = encode(
        previousHash,
        event.id,
        event.occurredAt.toString(),
        event.severity,
        event.category,
        event.eventType,
        event.sourceService,
        event.source,
        event.message,
        event.connections.toString(),
        event.latencyMs.toString(),
        event.throughputMbps.toString(),
        event.groupId.value,
        event.streamId,
        event.connectionId,
        event.icePath,
        event.relayFallbackReason,
        event.traceId,
        event.actorId,
        event.operation,
        event.result,
        event.errorCode,
        event.clockStatus,
    )

    private fun encode(vararg values: String?): String = values.joinToString(separator = "") { value ->
        val normalized = value.orEmpty()
        "${normalized.toByteArray(StandardCharsets.UTF_8).size}:$normalized"
    }

    private fun digest(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString(separator = "") { byte -> "%02x".format(byte) }
}
