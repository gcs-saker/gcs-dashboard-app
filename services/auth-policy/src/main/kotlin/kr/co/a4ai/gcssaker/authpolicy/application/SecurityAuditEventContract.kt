package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole

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

    fun maskGroupId(groupId: GroupId): String =
        groupId.value.take(64)

    fun safeReason(reason: String): String =
        reason.take(160)

    fun streamAccessMessage(
        allowed: Boolean,
        streamId: String,
        viewerGroupId: GroupId,
        publisherGroupId: GroupId,
        reason: String,
    ): String =
        "스트림 접근 ${if (allowed) "허용" else "거부"}: ${maskStreamId(streamId)} " +
            "[viewerGroup=${maskGroupId(viewerGroupId)}, publisherGroup=${maskGroupId(publisherGroupId)}] " +
            "(${safeReason(reason)})"
}
