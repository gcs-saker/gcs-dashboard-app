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
    GROUP_ADMIN,
    ADMIN,
    ;

    fun canBeIssuedByGroupAdmin(): Boolean = this == VIEWER || this == OPERATOR
}

enum class GroupStatus { ACTIVE, INACTIVE }

enum class Permission {
    VIEW_STREAM,
    PUBLISH_STREAM,
    CONTROL_ASSET,
    SEND_TALKBACK,
    MANAGE_GROUP_MEMBERS,
    MANAGE_GROUP_DEVICES,
    MANAGE_POLICY,
}

enum class StreamRouteScope {
    SAME_GROUP,
    DESCENDANT_GROUPS,
    CROSS_GROUP,
}

data class OrganizationUnit(
    val id: GroupId,
    val name: String,
    val type: GroupType,
    val parentId: GroupId? = null,
    val status: GroupStatus = GroupStatus.ACTIVE,
) {
    init {
        require(name.isNotBlank()) { "group name must not be blank" }
    }
}

class OrganizationHierarchy private constructor(
    private val unitsById: Map<GroupId, OrganizationUnit>,
) {
    fun contains(groupId: GroupId): Boolean =
        unitsById.containsKey(groupId)

    fun isAncestor(candidateAncestorId: GroupId, childId: GroupId): Boolean {
        var current = unitsById[childId]?.parentId
        while (current != null) {
            if (current == candidateAncestorId) {
                return true
            }
            current = unitsById[current]?.parentId
        }
        return false
    }

    fun units(): List<OrganizationUnit> = unitsById.values.toList()

    companion object {
        fun of(units: Collection<OrganizationUnit>): OrganizationHierarchy {
            val unitsById = units.associateBy { it.id }
            require(unitsById.size == units.size) { "group id must be unique" }
            require(unitsById.isNotEmpty()) { "group hierarchy must not be empty" }
            validateParentReferences(unitsById)
            validateAcyclic(unitsById)
            return OrganizationHierarchy(unitsById)
        }

        private fun validateParentReferences(unitsById: Map<GroupId, OrganizationUnit>) {
            unitsById.values.forEach { unit ->
                require(unit.parentId != unit.id) { "group must not be its own parent" }
                if (unit.parentId != null) {
                    require(unitsById.containsKey(unit.parentId)) { "parent group must exist" }
                }
            }
        }

        private fun validateAcyclic(unitsById: Map<GroupId, OrganizationUnit>) {
            unitsById.keys.forEach { groupId ->
                val seen = mutableSetOf<GroupId>()
                var current: GroupId? = groupId
                while (current != null) {
                    require(seen.add(current)) { "group hierarchy must not contain a cycle" }
                    current = unitsById[current]?.parentId
                }
            }
        }
    }
}

data class AuthenticatedPrincipal(
    val username: String,
    val role: UserRole,
    val groupId: GroupId,
    val securityVersion: Long = 1,
) {
    init {
        require(username.isNotBlank()) { "username must not be blank" }
        require(securityVersion > 0) { "security version must be positive" }
    }
}

data class StreamSessionDescriptor(
    val path: StreamPath,
    val publisherGroupId: GroupId,
    val startedAt: Instant,
)

data class StreamRoutePolicy(
    val viewerGroupId: GroupId,
    val publisherGroupId: GroupId,
    val scope: StreamRouteScope,
    val expiresAt: Instant? = null,
) {
    fun isActive(now: Instant): Boolean =
        expiresAt == null || expiresAt.isAfter(now)
}

class StreamRoutePolicies private constructor(
    private val values: List<StreamRoutePolicy>,
) {
    fun activeFor(viewerGroupId: GroupId, now: Instant): List<StreamRoutePolicy> =
        values
            .asSequence()
            .filter { it.viewerGroupId == viewerGroupId }
            .filter { it.isActive(now) }
            .toList()

    fun toList(): List<StreamRoutePolicy> = values.toList()

    companion object {
        fun empty(): StreamRoutePolicies = StreamRoutePolicies(emptyList())

        fun of(policies: Collection<StreamRoutePolicy>): StreamRoutePolicies =
            StreamRoutePolicies(policies.toList())
    }
}

data class StreamAccessDecision(
    val allowed: Boolean,
    val reason: String,
) {
    companion object {
        fun allow(reason: String) = StreamAccessDecision(true, reason)
        fun deny(reason: String) = StreamAccessDecision(false, reason)
    }
}
