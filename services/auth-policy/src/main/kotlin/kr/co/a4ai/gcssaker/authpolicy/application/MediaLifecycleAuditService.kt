package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.slf4j.MDC
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

data class MediaLifecycleAuditCommand(
    val groupId: String,
    val sessionReference: String,
    val operation: String,
    val occurredAt: Instant,
)

class MediaLifecycleAuditService(
    private val repository: OperationalEventRepository,
    private val now: () -> Instant = Instant::now,
) {
    private val sequence = AtomicLong()

    fun record(command: MediaLifecycleAuditCommand) {
        require(command.groupId.matches(GROUP_PATTERN)) { "invalid groupId" }
        require(command.sessionReference.matches(REFERENCE_PATTERN)) { "invalid sessionReference" }
        require(command.operation in OPERATIONS) { "unsupported lifecycle operation" }
        val receivedAt = now()
        require(command.occurredAt in receivedAt.minusSeconds(MAX_CLOCK_SKEW_SECONDS)..receivedAt.plusSeconds(MAX_CLOCK_SKEW_SECONDS)) {
            "lifecycle event time outside accepted window"
        }
        repository.append(command.toEvent(receivedAt, sequence.incrementAndGet()))
    }

    private fun MediaLifecycleAuditCommand.toEvent(receivedAt: Instant, sequence: Long) = OperationalEventReadModel(
        id = "audit-media-${receivedAt.toEpochMilli()}-$sequence",
        occurredAt = occurredAt,
        severity = "info",
        category = "audit",
        eventType = operation,
        sourceService = "media-control",
        source = "media lifecycle",
        message = "talkback lifecycle [sessionRef=$sessionReference]",
        connections = 0,
        latencyMs = 0,
        throughputMbps = 0.0,
        groupId = GroupId(groupId),
        traceId = MDC.get("traceId")?.take(64),
        actorId = "media-control",
        operation = operation,
        result = "observed",
        errorCode = "none",
        clockStatus = "unverified",
    )

    private companion object {
        const val MAX_CLOCK_SKEW_SECONDS = 300L
        val GROUP_PATTERN = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
        val REFERENCE_PATTERN = Regex("^[a-f0-9]{32}$")
        val OPERATIONS = setOf("talkback.session.started", "talkback.session.disconnected")
    }
}
