package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Instant

class GroupPolicyService(
    groups: Collection<OrganizationUnit>,
    private val routePolicies: StreamRoutePolicies = StreamRoutePolicies.empty(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val hierarchy = OrganizationHierarchy.of(groups)

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
        if (principal.role == UserRole.GROUP_ADMIN && hierarchy.isAncestor(principal.groupId, stream.publisherGroupId)) {
            return StreamAccessDecision.allow("group admin can view descendant group stream")
        }
        return StreamAccessDecision.deny("stream is outside principal group scope")
    }

    fun permissionsFor(role: UserRole): Set<Permission> =
        when (role) {
            UserRole.VIEWER -> setOf(Permission.VIEW_STREAM)
            UserRole.OPERATOR -> setOf(Permission.VIEW_STREAM, Permission.PUBLISH_STREAM, Permission.CONTROL_ASSET, Permission.SEND_TALKBACK)
            UserRole.GROUP_ADMIN -> setOf(
                Permission.VIEW_STREAM,
                Permission.PUBLISH_STREAM,
                Permission.CONTROL_ASSET,
                Permission.SEND_TALKBACK,
                Permission.MANAGE_GROUP_MEMBERS,
                Permission.MANAGE_GROUP_DEVICES,
            )
            UserRole.ADMIN -> Permission.entries.toSet()
        }

    private fun routePolicyDecision(
        principal: AuthenticatedPrincipal,
        stream: StreamSessionDescriptor,
        now: Instant,
    ): StreamAccessDecision? {
        val activePolicies = routePolicies.activeFor(principal.groupId, now)

        return activePolicies.firstNotNullOfOrNull { policy ->
            when (policy.scope) {
                StreamRouteScope.SAME_GROUP ->
                    if (policy.publisherGroupId == stream.publisherGroupId) {
                        StreamAccessDecision.allow("explicit same-group route policy")
                    } else {
                        null
                }
                StreamRouteScope.DESCENDANT_GROUPS ->
                    if (policy.publisherGroupId == stream.publisherGroupId || hierarchy.isAncestor(policy.publisherGroupId, stream.publisherGroupId)) {
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
}
