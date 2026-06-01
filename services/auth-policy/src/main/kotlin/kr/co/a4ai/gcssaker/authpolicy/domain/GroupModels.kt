package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

@JvmInline
value class GroupId(val value: String) {
    init {
        require(value.isNotBlank()) { "group id must not be blank" }
    }
}

@JvmInline
value class StreamPath(val value: String) {
    init {
        require(value.isNotBlank()) { "stream path must not be blank" }
        require(!value.startsWith("/")) { "stream path must be relative" }
    }
}

enum class GroupType {
    BATTALION,
    COMPANY,
    PLATOON,
    SQUAD,
}

enum class UserRole {
    VIEWER,
    OPERATOR,
    ADMIN,
}

enum class Permission {
    VIEW_STREAM,
    PUBLISH_STREAM,
    CONTROL_ASSET,
    MANAGE_POLICY,
}

data class OrganizationUnit(
    val id: GroupId,
    val name: String,
    val type: GroupType,
    val parentId: GroupId? = null,
) {
    init {
        require(name.isNotBlank()) { "group name must not be blank" }
    }
}

data class AuthenticatedPrincipal(
    val username: String,
    val role: UserRole,
    val groupId: GroupId,
) {
    init {
        require(username.isNotBlank()) { "username must not be blank" }
    }
}

data class StreamSessionDescriptor(
    val path: StreamPath,
    val publisherGroupId: GroupId,
    val startedAt: Instant,
)

data class StreamAccessDecision(
    val allowed: Boolean,
    val reason: String,
) {
    companion object {
        fun allow(reason: String) = StreamAccessDecision(true, reason)
        fun deny(reason: String) = StreamAccessDecision(false, reason)
    }
}
