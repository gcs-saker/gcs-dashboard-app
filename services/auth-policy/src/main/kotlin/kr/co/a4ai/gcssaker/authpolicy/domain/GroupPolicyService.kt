package kr.co.a4ai.gcssaker.authpolicy.domain

class GroupPolicyService(
    private val groups: Collection<OrganizationUnit>,
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
