package kr.co.a4ai.gcssaker.authpolicy.domain

class GroupAdministrationPolicy {
    fun canManageGroup(principal: AuthenticatedPrincipal, targetGroupId: GroupId): Boolean =
        principal.role == UserRole.ADMIN ||
            (principal.role == UserRole.GROUP_ADMIN && principal.groupId == targetGroupId)

    fun canIssueMemberRole(principal: AuthenticatedPrincipal, targetGroupId: GroupId, role: UserRole): Boolean =
        canManageGroup(principal, targetGroupId) && role.canBeIssuedByGroupAdmin()
}
