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
    fun list(principal: AuthenticatedPrincipal, groupId: GroupId, limit: Int = 200, offset: Int = 0): List<AuthUser> {
        administrationPolicy.requireGroupManagement(principal, groupId)
        return users.listByGroup(groupId, limit, offset).filter { it.role != UserRole.ADMIN }
    }

    @Synchronized
    fun update(
        principal: AuthenticatedPrincipal,
        groupId: GroupId,
        username: String,
        command: GroupMemberUpdate,
    ): AuthUser {
        administrationPolicy.requireGroupManagement(principal, groupId)
        val current = users.findByUsername(username)
            ?: throw ResourceNotFoundError(PolicyErrorCodes.MEMBER_NOT_FOUND, "user not found")
        if (current.groupId != groupId) {
            throw ResourceNotFoundError(PolicyErrorCodes.MEMBER_NOT_FOUND, "user not found")
        }
        if (current.role == UserRole.ADMIN || current.role == UserRole.GROUP_ADMIN) {
            throw StateConflictError(
                PolicyErrorCodes.ADMINISTRATOR_REPLACEMENT_REQUIRED,
                "administrator accounts require the replacement flow",
            )
        }
        val nextRole = command.role ?: current.role
        if (!nextRole.canBeIssuedByGroupAdmin()) {
            throw InvalidContractError(PolicyErrorCodes.MEMBER_ROLE_INVALID, "member role must be viewer or operator")
        }
        val nextPasswordHash = command.password?.let {
            if (it.length < 12) {
                throw InvalidContractError(PolicyErrorCodes.PASSWORD_TOO_SHORT, "password must be at least 12 characters")
            }
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
        administrationPolicy.requireSystemAdministrator(principal)
        val before = users.listByGroup(groupId, limit = 500)
            .filter { it.role == UserRole.GROUP_ADMIN }.map { it.username }
        return users.replaceGroupAdmin(groupId, username).also {
            (before + username).distinct().forEach(refreshSessions::revokePrincipalSessions)
        }
    }
}
