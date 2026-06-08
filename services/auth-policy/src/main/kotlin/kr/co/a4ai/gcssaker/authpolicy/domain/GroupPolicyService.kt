package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Instant

class GroupPolicyService(
    private val groups: Collection<OrganizationUnit>,
    private val routePolicies: Collection<StreamRoutePolicy> = emptyList(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val groupsById = groups.associateBy { it.id }

    fun canViewStream(
        principal: AuthenticatedPrincipal,
        stream: StreamSessionDescriptor,
    ): StreamAccessDecision {
        if (principal.role == UserRole.ADMIN) {
            return StreamAccessDecision.allow("admin can view every stream")
        }
        if (principal.groupId == stream.publisherGroupId) {
            return StreamAccessDecision.allow("same group stream")
        }
        routePolicyDecision(principal, stream, Instant.now(clock))?.let {
            return it
        }
        if (principal.role == UserRole.OPERATOR && isAncestor(principal.groupId, stream.publisherGroupId)) {
            return StreamAccessDecision.allow("operator can view descendant group stream")
        }
        return StreamAccessDecision.deny("stream is outside principal group scope")
    }

    fun permissionsFor(role: UserRole): Set<Permission> =
        when (role) {
            UserRole.VIEWER -> setOf(Permission.VIEW_STREAM)
            UserRole.OPERATOR -> setOf(Permission.VIEW_STREAM, Permission.PUBLISH_STREAM, Permission.CONTROL_ASSET)
            UserRole.ADMIN -> Permission.entries.toSet()
        }

    private fun routePolicyDecision(
        principal: AuthenticatedPrincipal,
        stream: StreamSessionDescriptor,
        now: Instant,
    ): StreamAccessDecision? {
        val activePolicies = routePolicies
            .filter { it.isActive(now) }
            .filter { it.viewerGroupId == principal.groupId }

        return activePolicies.firstNotNullOfOrNull { policy ->
            when (policy.scope) {
                StreamRouteScope.SAME_GROUP ->
                    if (policy.publisherGroupId == stream.publisherGroupId) {
                        StreamAccessDecision.allow("explicit same-group route policy")
                    } else {
                        null
                    }
                StreamRouteScope.DESCENDANT_GROUPS ->
                    if (policy.publisherGroupId == stream.publisherGroupId || isAncestor(policy.publisherGroupId, stream.publisherGroupId)) {
                        StreamAccessDecision.allow("explicit descendant route policy")
                    } else {
                        null
                    }
                StreamRouteScope.CROSS_GROUP ->
                    if (policy.publisherGroupId == stream.publisherGroupId) {
                        StreamAccessDecision.allow("active cross-group route policy")
                    } else {
                        null
                    }
            }
        }
    }

    private fun isAncestor(candidateAncestorId: GroupId, childId: GroupId): Boolean {
        var current = groupsById[childId]?.parentId
        while (current != null) {
            if (current == candidateAncestorId) {
                return true
            }
            current = groupsById[current]?.parentId
        }
        return false
    }
}
