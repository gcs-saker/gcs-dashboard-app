package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

interface SecurityAuditPublisher {
    fun publishLoginSucceeded(principal: AuthenticatedPrincipal)
    fun publishLoginFailed(username: String)
    fun publishLogout(principal: AuthenticatedPrincipal?)
    fun publishRefreshFailed(reason: String)
    fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    )
}

object NoopSecurityAuditPublisher : SecurityAuditPublisher {
    override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) = Unit
    override fun publishLoginFailed(username: String) = Unit
    override fun publishLogout(principal: AuthenticatedPrincipal?) = Unit
    override fun publishRefreshFailed(reason: String) = Unit
    override fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    ) = Unit
}

class RepositorySecurityAuditPublisher(
    private val repository: OperationalEventRepository,
    private val now: () -> Instant = Instant::now,
) : SecurityAuditPublisher {
    private val sequence = AtomicLong()

    override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) {
        append(
            principal = principal,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGIN_SUCCEEDED,
            message = "로그인 성공: ${SecurityAuditEventContract.maskUsername(principal.username)}",
            severity = SecurityAuditEventContract.SEVERITY_INFO,
        )
    }

    override fun publishLoginFailed(username: String) {
        append(
            principal = SecurityAuditEventContract.UNKNOWN_PRINCIPAL,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGIN_FAILED,
            message = "로그인 실패: ${SecurityAuditEventContract.maskUsername(username)}",
            severity = SecurityAuditEventContract.SEVERITY_WARN,
        )
    }

    override fun publishLogout(principal: AuthenticatedPrincipal?) {
        val auditPrincipal = principal ?: SecurityAuditEventContract.UNKNOWN_PRINCIPAL
        val username = principal?.username ?: SecurityAuditEventContract.UNKNOWN_USERNAME
        append(
            principal = auditPrincipal,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGOUT,
            message = "로그아웃 요청: ${SecurityAuditEventContract.maskUsername(username)}",
            severity = SecurityAuditEventContract.SEVERITY_INFO,
        )
    }

    override fun publishRefreshFailed(reason: String) {
        append(
            principal = SecurityAuditEventContract.UNKNOWN_PRINCIPAL,
            eventType = SecurityAuditEventContract.EVENT_TYPE_REFRESH_FAILED,
            message = "refresh 실패: ${SecurityAuditEventContract.safeReason(reason)}",
            severity = SecurityAuditEventContract.SEVERITY_WARN,
        )
    }

    override fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    ) {
        append(
            principal = principal,
            eventType = if (allowed) {
                SecurityAuditEventContract.EVENT_TYPE_STREAM_ACCESS_ALLOWED
            } else {
                SecurityAuditEventContract.EVENT_TYPE_STREAM_ACCESS_DENIED
            },
            message = "스트림 접근 ${if (allowed) "허용" else "거부"}: ${SecurityAuditEventContract.maskStreamId(streamId)} (${SecurityAuditEventContract.safeReason(reason)})",
            severity = if (allowed) SecurityAuditEventContract.SEVERITY_INFO else SecurityAuditEventContract.SEVERITY_WARN,
            streamId = streamId,
        )
    }

    private fun append(
        principal: AuthenticatedPrincipal,
        eventType: String,
        message: String,
        severity: String,
        streamId: String? = null,
    ) {
        val occurredAt = now()
        repository.append(
            OperationalEventReadModel(
                id = "${SecurityAuditEventContract.ID_PREFIX}${occurredAt.toEpochMilli()}-${sequence.incrementAndGet()}",
                occurredAt = occurredAt,
                severity = severity,
                category = SecurityAuditEventContract.CATEGORY_SECURITY,
                eventType = eventType,
                sourceService = SecurityAuditEventContract.SOURCE_SERVICE_AUTH_POLICY,
                source = SecurityAuditEventContract.SOURCE_SECURITY,
                message = message,
                connections = SecurityAuditEventContract.NO_CONNECTIONS,
                latencyMs = SecurityAuditEventContract.NO_LATENCY_MS,
                throughputMbps = SecurityAuditEventContract.NO_THROUGHPUT_MBPS,
                groupId = principal.groupId,
                streamId = streamId,
            ),
        )
    }
}

object SecurityAuditEventContract {
    const val ID_PREFIX = "audit-security-"
    const val CATEGORY_SECURITY = "security"
    const val SOURCE_SERVICE_AUTH_POLICY = "auth-policy"
    const val SOURCE_SECURITY = "보안 감사"
    const val SEVERITY_INFO = "info"
    const val SEVERITY_WARN = "warn"
    const val EVENT_TYPE_LOGIN_SUCCEEDED = "auth.login.succeeded"
    const val EVENT_TYPE_LOGIN_FAILED = "auth.login.failed"
    const val EVENT_TYPE_LOGOUT = "auth.logout"
    const val EVENT_TYPE_REFRESH_FAILED = "auth.refresh.failed"
    const val EVENT_TYPE_STREAM_ACCESS_ALLOWED = "stream.access.allowed"
    const val EVENT_TYPE_STREAM_ACCESS_DENIED = "stream.access.denied"
    const val UNKNOWN_USERNAME = "unknown"
    const val UNKNOWN_GROUP_ID = "security"
    const val NO_CONNECTIONS = 0
    const val NO_LATENCY_MS = 0L
    const val NO_THROUGHPUT_MBPS = 0.0
    val UNKNOWN_PRINCIPAL = AuthenticatedPrincipal(UNKNOWN_USERNAME, UserRole.ADMIN, GroupId(UNKNOWN_GROUP_ID))

    fun maskUsername(username: String): String {
        val trimmed = username.trim()
        if (trimmed.length <= 2) return "**"
        return "${trimmed.first()}***${trimmed.last()}"
    }

    fun maskStreamId(streamId: String): String =
        streamId.take(96)

    fun safeReason(reason: String): String =
        reason.take(160)
}
