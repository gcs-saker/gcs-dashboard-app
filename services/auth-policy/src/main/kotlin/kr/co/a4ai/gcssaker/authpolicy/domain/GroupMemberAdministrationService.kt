package kr.co.a4ai.gcssaker.authpolicy.domain

data class GroupMemberUpdate(
    val role: UserRole? = null,
    val active: Boolean? = null,
    val password: String? = null,
)

class GroupMemberAdministrationService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    private val administrationPolicy: GroupAdministrationPolicy = GroupAdministrationPolicy(),
    private val refreshSessions: RefreshSessionStore = StatelessRefreshSessionStore,
) {
    fun list(principal: AuthenticatedPrincipal, groupId: GroupId): List<AuthUser> {
        require(administrationPolicy.canManageGroup(principal, groupId)) { "group member access denied" }
        return users.list().filter { it.groupId == groupId }.sortedBy { it.username }
    }

    @Synchronized
    fun update(
        principal: AuthenticatedPrincipal,
        groupId: GroupId,
        username: String,
        command: GroupMemberUpdate,
    ): AuthUser {
        require(administrationPolicy.canManageGroup(principal, groupId)) { "group member access denied" }
        val current = users.findByUsername(username) ?: error("User not found")
        require(current.groupId == groupId) { "User not found" }
        require(current.role != UserRole.ADMIN && current.role != UserRole.GROUP_ADMIN) {
            "administrator accounts require the replacement flow"
        }
        val nextRole = command.role ?: current.role
        require(nextRole.canBeIssuedByGroupAdmin()) { "member role must be viewer or operator" }
        val nextPasswordHash = command.password?.let {
            require(it.length >= 12) { "password must be at least 12 characters" }
            passwordHasher.hash(it)
        } ?: current.passwordHash
        return users.update(
            current.copy(
                role = nextRole,
                active = command.active ?: current.active,
                passwordHash = nextPasswordHash,
                securityVersion = current.securityVersion + 1,
            ),
        ).also { refreshSessions.revokePrincipalSessions(username) }
    }

    fun replaceGroupAdmin(
        principal: AuthenticatedPrincipal,
        groupId: GroupId,
        username: String,
    ): AuthUser {
        require(principal.role == UserRole.ADMIN) { "system administrator required" }
        val before = users.list().filter { it.groupId == groupId && it.role == UserRole.GROUP_ADMIN }.map { it.username }
        return users.replaceGroupAdmin(groupId, username).also {
            (before + username).distinct().forEach(refreshSessions::revokePrincipalSessions)
        }
    }
}
