package kr.co.a4ai.gcssaker.authpolicy.domain

data class AuthUser(
    val id: Int = 0,
    val username: String,
    val email: String,
    val passwordHash: String,
    val companyId: Int = 1,
    val role: UserRole,
    val groupId: GroupId,
) {
    init {
        require(username.isNotBlank()) { "username must not be blank" }
        require(email.isNotBlank()) { "email must not be blank" }
        require(passwordHash.isNotBlank()) { "password hash must not be blank" }
    }

    fun principal(): AuthenticatedPrincipal =
        AuthenticatedPrincipal(username = username, role = role, groupId = groupId)
}

interface AuthUserRepository {
    fun findByUsername(username: String): AuthUser?
    fun findByEmail(email: String): AuthUser?
    fun save(user: AuthUser): AuthUser
}
