package kr.co.a4ai.gcssaker.authpolicy.domain

data class GroupAccess(
    val canView: Boolean,
    val canControl: Boolean,
)

class GroupAccessService(
    private val hierarchyRepository: OrganizationHierarchyRepository,
    private val devices: RegisteredDeviceRepository,
) {
    fun visibleGroups(principal: AuthenticatedPrincipal): List<OrganizationUnit> =
        hierarchyRepository.current().units()
            .filter { accessFor(principal, it.id).canView }
            .sortedBy { it.id.value }

    fun devicesFor(principal: AuthenticatedPrincipal, groupId: GroupId): List<RegisteredDevice> {
        requireViewAccess(principal, groupId)
        return devices.list().filter { it.groupId == groupId }.sortedBy { it.deviceUuid }
    }

    fun accessFor(principal: AuthenticatedPrincipal, groupId: GroupId): GroupAccess {
        val hierarchy = hierarchyRepository.current()
        if (!hierarchy.contains(groupId)) return GroupAccess(canView = false, canControl = false)
        val isOwnGroup = principal.groupId == groupId
        val isDescendant = hierarchy.isAncestor(principal.groupId, groupId)
        val canView = principal.role == UserRole.ADMIN || isOwnGroup ||
            (principal.role == UserRole.OPERATOR && isDescendant)
        val canControl = principal.role == UserRole.ADMIN ||
            (principal.role == UserRole.OPERATOR && (isOwnGroup || isDescendant))
        return GroupAccess(canView = canView, canControl = canControl)
    }

    fun group(principal: AuthenticatedPrincipal, groupId: GroupId): OrganizationUnit {
        requireViewAccess(principal, groupId)
        return hierarchyRepository.current().units().first { it.id == groupId }
    }

    private fun requireViewAccess(principal: AuthenticatedPrincipal, groupId: GroupId) {
        require(hierarchyRepository.current().contains(groupId)) { GROUP_NOT_FOUND }
        check(accessFor(principal, groupId).canView) { GROUP_ACCESS_DENIED }
    }

    companion object {
        const val GROUP_NOT_FOUND = "group not found"
        const val GROUP_ACCESS_DENIED = "group access denied"
    }
}
