package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

class OperationalFailureLogger(
    private val repository: OperationalEventRepository,
    private val now: () -> Instant = Instant::now,
) : OperationalFailureLoggerFacade {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val sequence = AtomicLong()

    override fun record(
        component: String,
        operation: String,
        severity: String,
        message: String,
        error: Throwable?,
        groupId: GroupId,
    ) {
        logger.warn(
            "{} component={} operation={} message={}",
            OperationalFailureLogContract.LOG_MARKER,
            component,
            operation,
            message,
            error,
        )
        val occurredAt = now()
        repository.append(
            OperationalEventReadModel(
                id = "${OperationalFailureLogContract.ID_PREFIX}${occurredAt.toEpochMilli()}-${sequence.incrementAndGet()}",
                occurredAt = occurredAt,
                severity = severity,
                category = OperationalFailureLogContract.CATEGORY_SYSTEM,
                eventType = "${component}.${operation}",
                sourceService = component,
                source = OperationalFailureLogContract.SOURCE,
                message = message.take(OperationalFailureLogContract.MAX_MESSAGE_LENGTH),
                connections = OperationalFailureLogContract.NO_CONNECTIONS,
                latencyMs = OperationalFailureLogContract.NO_LATENCY_MS,
                throughputMbps = OperationalFailureLogContract.NO_THROUGHPUT_MBPS,
                groupId = groupId,
            ),
        )
    }
}

interface OperationalFailureLoggerFacade {
    fun record(
        component: String,
        operation: String,
        severity: String,
        message: String,
        error: Throwable? = null,
        groupId: GroupId = OperationalFailureLogContract.SYSTEM_GROUP_ID,
    )
}

object OperationalFailureLogContract {
    const val ID_PREFIX = "ops-failure-"
    const val LOG_MARKER = "operational_failure"
    const val CATEGORY_SYSTEM = "system"
    const val SOURCE = "운영 장애 감지"
    const val SEVERITY_WARN = "warn"
    const val SEVERITY_ERROR = "error"
    const val COMPONENT_REDIS = "redis"
    const val OPERATION_ACCESS_PRINCIPAL_GET = "access_principal_get"
    const val OPERATION_ACCESS_PRINCIPAL_PUT = "access_principal_put"
    const val OPERATION_REFRESH_SESSION_PUT = "refresh_session_put"
    const val OPERATION_REFRESH_SESSION_CONSUME = "refresh_session_consume"
    const val OPERATION_REFRESH_SESSION_REVOKE = "refresh_session_revoke"
    const val MESSAGE_PRINCIPAL_CACHE_DEGRADED = "Redis principal cache unavailable; continuing without cached principal"
    const val MESSAGE_REFRESH_SESSION_FAIL_CLOSED = "Redis refresh session store unavailable; refresh flow failed closed"
    const val NO_CONNECTIONS = 0
    const val NO_LATENCY_MS = 0L
    const val NO_THROUGHPUT_MBPS = 0.0
    const val MAX_MESSAGE_LENGTH = 240
    val SYSTEM_GROUP_ID = GroupId("system")
}
