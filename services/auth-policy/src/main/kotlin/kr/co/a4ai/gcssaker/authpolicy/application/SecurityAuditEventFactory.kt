package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import java.time.Instant

class SecurityAuditEventFactory(
    private val nextSequence: () -> Long,
) {
    fun loginSucceeded(principal: AuthenticatedPrincipal, occurredAt: Instant): OperationalEventReadModel =
        event(
            principal = principal,
            occurredAt = occurredAt,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGIN_SUCCEEDED,
            message = "로그인 성공: ${SecurityAuditEventContract.maskUsername(principal.username)}",
            severity = SecurityAuditEventContract.SEVERITY_INFO,
        )

    fun loginFailed(username: String, occurredAt: Instant): OperationalEventReadModel =
        event(
            principal = SecurityAuditEventContract.UNKNOWN_PRINCIPAL,
            occurredAt = occurredAt,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGIN_FAILED,
            message = "로그인 실패: ${SecurityAuditEventContract.maskUsername(username)}",
            severity = SecurityAuditEventContract.SEVERITY_WARN,
        )

    fun logout(principal: AuthenticatedPrincipal?, occurredAt: Instant): OperationalEventReadModel {
        val auditPrincipal = principal ?: SecurityAuditEventContract.UNKNOWN_PRINCIPAL
        val username = principal?.username ?: SecurityAuditEventContract.UNKNOWN_USERNAME
        return event(
            principal = auditPrincipal,
            occurredAt = occurredAt,
            eventType = SecurityAuditEventContract.EVENT_TYPE_LOGOUT,
            message = "로그아웃 요청: ${SecurityAuditEventContract.maskUsername(username)}",
            severity = SecurityAuditEventContract.SEVERITY_INFO,
        )
    }

    fun refreshFailed(reason: String, occurredAt: Instant): OperationalEventReadModel =
        event(
            principal = SecurityAuditEventContract.UNKNOWN_PRINCIPAL,
            occurredAt = occurredAt,
            eventType = SecurityAuditEventContract.EVENT_TYPE_REFRESH_FAILED,
            message = "refresh 실패: ${SecurityAuditEventContract.safeReason(reason)}",
            severity = SecurityAuditEventContract.SEVERITY_WARN,
        )

    fun streamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        publisherGroupId: GroupId,
        allowed: Boolean,
        reason: String,
        occurredAt: Instant,
        action: String = "view_stream",
    ): OperationalEventReadModel =
        event(
            principal = principal,
            occurredAt = occurredAt,
            eventType = if (allowed) {
                SecurityAuditEventContract.EVENT_TYPE_STREAM_ACCESS_ALLOWED
            } else {
                SecurityAuditEventContract.EVENT_TYPE_STREAM_ACCESS_DENIED
            },
            message = "[action=${SecurityAuditEventContract.safeReason(action)}] " +
                SecurityAuditEventContract.streamAccessMessage(
                allowed = allowed,
                streamId = streamId,
                viewerGroupId = principal.groupId,
                publisherGroupId = publisherGroupId,
                reason = reason,
            ),
            severity = if (allowed) SecurityAuditEventContract.SEVERITY_INFO else SecurityAuditEventContract.SEVERITY_WARN,
            streamId = streamId,
        )

    fun groupManagement(
        principal: AuthenticatedPrincipal,
        targetGroupId: GroupId,
        action: String,
        target: String,
        clientIp: String,
        occurredAt: Instant,
    ): OperationalEventReadModel = event(
        principal = principal,
        occurredAt = occurredAt,
        eventType = SecurityAuditEventContract.EVENT_TYPE_GROUP_MANAGEMENT,
        message = "group management: ${SecurityAuditEventContract.safeReason(action)} " +
            "[target=${SecurityAuditEventContract.maskUsername(target)}, ip=${SecurityAuditEventContract.safeClientIp(clientIp)}]",
        severity = SecurityAuditEventContract.SEVERITY_INFO,
        groupId = targetGroupId,
    )

    private fun event(
        principal: AuthenticatedPrincipal,
        occurredAt: Instant,
        eventType: String,
        message: String,
        severity: String,
        streamId: String? = null,
        groupId: GroupId = principal.groupId,
    ): OperationalEventReadModel =
        OperationalEventReadModel(
            id = "${SecurityAuditEventContract.ID_PREFIX}${occurredAt.toEpochMilli()}-${nextSequence()}",
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
            groupId = groupId,
            streamId = streamId,
        )
}
