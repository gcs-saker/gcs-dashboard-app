package kr.co.a4ai.gcssaker.authpolicy.domain

class GroupAdministrationPolicy {
    fun canManageGroup(principal: AuthenticatedPrincipal, targetGroupId: GroupId): Boolean =
        principal.role == UserRole.ADMIN ||
            (principal.role == UserRole.GROUP_ADMIN && principal.groupId == targetGroupId)

    fun canIssueMemberRole(principal: AuthenticatedPrincipal, targetGroupId: GroupId, role: UserRole): Boolean =
        canManageGroup(principal, targetGroupId) && role.canBeIssuedByGroupAdmin()

    fun requireGroupManagement(principal: AuthenticatedPrincipal, targetGroupId: GroupId) {
        if (!canManageGroup(principal, targetGroupId)) {
            throw PermissionDeniedError(
                PolicyErrorCodes.GROUP_MANAGEMENT_SCOPE_REQUIRED,
                "group management scope required",
            )
        }
    }

    fun requireSystemAdministrator(principal: AuthenticatedPrincipal) {
        if (principal.role != UserRole.ADMIN) {
            throw PermissionDeniedError(
                PolicyErrorCodes.SYSTEM_ADMINISTRATOR_REQUIRED,
                "system administrator required",
            )
        }
    }

    fun requireGroupManagerRole(principal: AuthenticatedPrincipal) {
        if (principal.role != UserRole.ADMIN && principal.role != UserRole.GROUP_ADMIN) {
            throw PermissionDeniedError(
                PolicyErrorCodes.GROUP_ADMINISTRATOR_ROLE_REQUIRED,
                "administrator role required",
            )
        }
    }
}
