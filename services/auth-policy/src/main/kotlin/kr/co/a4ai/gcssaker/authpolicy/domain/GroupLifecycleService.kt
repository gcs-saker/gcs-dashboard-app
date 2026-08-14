package kr.co.a4ai.gcssaker.authpolicy.domain

data class CreateGroupCommand(
    val id: GroupId,
    val name: String,
    val type: GroupType,
    val parentId: GroupId?,
)

data class UpdateGroupCommand(
    val name: String? = null,
    val parentId: GroupId? = null,
    val changeParent: Boolean = false,
)

class GroupLifecycleService(
    private val groups: OrganizationHierarchyRepository,
    private val users: AuthUserRepository,
    private val devices: RegisteredDeviceRepository,
    private val refreshSessions: RefreshSessionStore = StatelessRefreshSessionStore,
) {
    fun list(principal: AuthenticatedPrincipal): List<OrganizationUnit> {
        requireSystemAdmin(principal)
        return groups.listAll()
    }

    @Synchronized
    fun create(principal: AuthenticatedPrincipal, command: CreateGroupCommand): OrganizationUnit {
        requireSystemAdmin(principal)
        command.parentId?.let { parent ->
            require(groups.listAll().any { it.id == parent && it.status == GroupStatus.ACTIVE }) {
                "active parent group is required"
            }
        }
        return groups.create(
            OrganizationUnit(command.id, command.name, command.type, command.parentId, GroupStatus.INACTIVE),
        )
    }

    @Synchronized
    fun update(
        principal: AuthenticatedPrincipal,
        groupId: GroupId,
        command: UpdateGroupCommand,
    ): OrganizationUnit {
        requireSystemAdmin(principal)
        val current = requireGroup(groupId)
        val nextParent = if (command.changeParent) command.parentId else current.parentId
        val updated = current.copy(name = command.name?.trim()?.ifBlank { current.name } ?: current.name, parentId = nextParent)
        validateHierarchyCandidate(updated)
        if (current.parentId != updated.parentId) invalidateSubtreeUsers(groupId)
        return groups.update(updated)
    }

    @Synchronized
    fun activate(principal: AuthenticatedPrincipal, groupId: GroupId): OrganizationUnit {
        requireSystemAdmin(principal)
        val current = requireGroup(groupId)
        require(users.list().count { it.groupId == groupId && it.role == UserRole.GROUP_ADMIN && it.active } == 1) {
            "exactly one active group administrator is required"
        }
        current.parentId?.let { parent ->
            require(requireGroup(parent).status == GroupStatus.ACTIVE) { "active parent group is required" }
        }
        return groups.update(current.copy(status = GroupStatus.ACTIVE))
    }

    @Synchronized
    fun deactivate(principal: AuthenticatedPrincipal, groupId: GroupId): OrganizationUnit {
        requireSystemAdmin(principal)
        val current = requireGroup(groupId)
        require(groups.listAll().count { it.status == GroupStatus.ACTIVE } > 1) {
            "at least one active group must remain"
        }
        require(groups.listAll().none { it.parentId == groupId && it.status == GroupStatus.ACTIVE }) {
            "active child groups must be deactivated first"
        }
        require(devices.list().none { it.groupId == groupId && it.status == RegisteredDeviceStatus.ACTIVE }) {
            "active devices must be disabled first"
        }
        invalidateSubtreeUsers(groupId)
        return groups.update(current.copy(status = GroupStatus.INACTIVE))
    }

    private fun validateHierarchyCandidate(updated: OrganizationUnit) {
        val candidate = groups.listAll().map { if (it.id == updated.id) updated else it }
        val active = candidate.filter { it.status == GroupStatus.ACTIVE }
        if (active.isNotEmpty()) OrganizationHierarchy.of(active)
    }

    private fun invalidateSubtreeUsers(groupId: GroupId) {
        val hierarchy = runCatching { groups.current() }.getOrNull()
        users.list()
            .filter { it.groupId == groupId || hierarchy?.isAncestor(groupId, it.groupId) == true }
            .forEach {
                users.update(it.copy(securityVersion = it.securityVersion + 1))
                refreshSessions.revokePrincipalSessions(it.username)
            }
    }

    private fun requireGroup(groupId: GroupId): OrganizationUnit =
        groups.listAll().firstOrNull { it.id == groupId } ?: error("group not found")

    private fun requireSystemAdmin(principal: AuthenticatedPrincipal) {
        require(principal.role == UserRole.ADMIN) { "system administrator required" }
    }
}
