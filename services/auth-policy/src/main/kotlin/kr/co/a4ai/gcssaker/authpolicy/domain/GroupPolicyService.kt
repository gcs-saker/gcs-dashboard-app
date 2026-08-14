package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Instant

class GroupPolicyService private constructor(
    private val hierarchyProvider: () -> OrganizationHierarchy,
    private val routePolicies: StreamRoutePolicies = StreamRoutePolicies.empty(),
    private val clock: Clock = Clock.systemUTC(),
) {
    constructor(
        groups: Collection<OrganizationUnit>,
        routePolicies: StreamRoutePolicies = StreamRoutePolicies.empty(),
        clock: Clock = Clock.systemUTC(),
    ) : this(validatedHierarchyProvider(groups), routePolicies, clock)

    constructor(
        hierarchyRepository: OrganizationHierarchyRepository,
        routePolicies: StreamRoutePolicies = StreamRoutePolicies.empty(),
        clock: Clock = Clock.systemUTC(),
    ) : this(hierarchyRepository::current, routePolicies, clock)

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
        if (principal.role == UserRole.GROUP_ADMIN && hierarchyProvider().isAncestor(principal.groupId, stream.publisherGroupId)) {
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

    fun canSendTalkback(principal: AuthenticatedPrincipal, targetGroupId: GroupId): StreamAccessDecision {
        if (principal.role == UserRole.ADMIN) return StreamAccessDecision.allow("admin can send talkback")
        if (principal.groupId == targetGroupId &&
            (principal.role == UserRole.OPERATOR || principal.role == UserRole.GROUP_ADMIN)
        ) {
            return StreamAccessDecision.allow("same group talkback")
        }
        if (principal.role == UserRole.GROUP_ADMIN && hierarchyProvider().isAncestor(principal.groupId, targetGroupId)) {
            return StreamAccessDecision.allow("group admin can send descendant talkback")
        }
        return StreamAccessDecision.deny("talkback target is outside principal operational scope")
    }

    private fun routePolicyDecision(
        principal: AuthenticatedPrincipal,
        stream: StreamSessionDescriptor,
        now: Instant,
    ): StreamAccessDecision? {
        val activePolicies = routePolicies.activeFor(principal.groupId, now)
        val hierarchy = hierarchyProvider()

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

    companion object {
        private fun validatedHierarchyProvider(groups: Collection<OrganizationUnit>): () -> OrganizationHierarchy {
            val hierarchy = OrganizationHierarchy.of(groups)
            return { hierarchy }
        }
    }
}
