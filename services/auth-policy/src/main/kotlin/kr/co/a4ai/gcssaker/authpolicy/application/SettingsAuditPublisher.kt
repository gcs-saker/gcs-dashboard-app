package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

interface SettingsAuditPublisher {
    fun publishTimeSyncConfigChanged(
        principal: AuthenticatedPrincipal,
        previous: TimeSyncConfig,
        next: TimeSyncConfig,
    )
}

object NoopSettingsAuditPublisher : SettingsAuditPublisher {
    override fun publishTimeSyncConfigChanged(
        principal: AuthenticatedPrincipal,
        previous: TimeSyncConfig,
        next: TimeSyncConfig,
    ) = Unit
}

class RepositorySettingsAuditPublisher(
    private val repository: OperationalEventRepository,
    private val now: () -> Instant = Instant::now,
) : SettingsAuditPublisher {
    private val sequence = AtomicLong()

    override fun publishTimeSyncConfigChanged(
        principal: AuthenticatedPrincipal,
        previous: TimeSyncConfig,
        next: TimeSyncConfig,
    ) {
        repository.append(
            OperationalEventReadModel(
                id = "${SettingsAuditEventContract.TIME_SYNC_ID_PREFIX}${now().toEpochMilli()}-${sequence.incrementAndGet()}",
                occurredAt = next.updatedAt,
                severity = SettingsAuditEventContract.SEVERITY_INFO,
                category = SettingsAuditEventContract.CATEGORY_AUDIT,
                eventType = SettingsAuditEventContract.EVENT_TYPE_TIME_SYNC_UPDATED,
                sourceService = SettingsAuditEventContract.SOURCE_SERVICE_AUTH_POLICY,
                source = SettingsAuditEventContract.SOURCE_SETTINGS,
                message = SettingsAuditEventContract.timeSyncMessage(previous, next, principal.username),
                connections = SettingsAuditEventContract.NO_CONNECTIONS,
                latencyMs = SettingsAuditEventContract.NO_LATENCY_MS,
                throughputMbps = SettingsAuditEventContract.NO_THROUGHPUT_MBPS,
                groupId = principal.groupId,
            ),
        )
    }
}

object SettingsAuditEventContract {
    const val TIME_SYNC_ID_PREFIX = "audit-time-sync-"
    const val SEVERITY_INFO = "info"
    const val CATEGORY_AUDIT = "audit"
    const val EVENT_TYPE_TIME_SYNC_UPDATED = "time_sync.config.updated"
    const val SOURCE_SERVICE_AUTH_POLICY = "auth-policy"
    const val SOURCE_SETTINGS = "운영 설정"
    const val NO_CONNECTIONS = 0
    const val NO_LATENCY_MS = 0L
    const val NO_THROUGHPUT_MBPS = 0.0

    fun timeSyncMessage(previous: TimeSyncConfig, next: TimeSyncConfig, username: String): String =
        "시간 동기화 설정 변경: ${previous.mode.name.lowercase()} -> ${next.mode.name.lowercase()} by $username"
}
