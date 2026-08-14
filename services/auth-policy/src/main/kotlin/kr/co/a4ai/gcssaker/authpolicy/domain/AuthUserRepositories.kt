package kr.co.a4ai.gcssaker.authpolicy.domain

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class InMemoryAuthUserRepository(users: Collection<AuthUser>) : AuthUserRepository {
    private val usersByUsername = ConcurrentHashMap(users.associateBy { it.username })
    private val usersByEmail = ConcurrentHashMap(users.associateBy { it.email.lowercase() })
    private val nextId = AtomicInteger((users.maxOfOrNull { it.id } ?: 0) + 1)

    override fun findByUsername(username: String): AuthUser? = usersByUsername[username]

    override fun findByEmail(email: String): AuthUser? = usersByEmail[email.lowercase()]

    @Synchronized
    override fun save(user: AuthUser): AuthUser {
        require(usersByUsername[user.username] == null) { "Username already registered" }
        require(usersByEmail[user.email.lowercase()] == null) { "Email already registered" }
        val saved = if (user.id > 0) user else user.copy(id = nextId.getAndIncrement())
        usersByUsername[saved.username] = saved
        usersByEmail[saved.email.lowercase()] = saved
        return saved
    }

    override fun list(): List<AuthUser> = usersByUsername.values.sortedBy { it.username }

    @Synchronized
    override fun update(user: AuthUser): AuthUser {
        val current = usersByUsername[user.username] ?: error("User not found")
        require(current.id == user.id) { "User identity cannot change" }
        usersByEmail.remove(current.email.lowercase())
        usersByUsername[user.username] = user
        usersByEmail[user.email.lowercase()] = user
        return user
    }

    @Synchronized
    override fun replaceGroupAdmin(groupId: GroupId, username: String): AuthUser {
        val target = usersByUsername[username] ?: error("User not found")
        require(target.groupId == groupId) { "User must belong to target group" }
        usersByUsername.values
            .filter { it.groupId == groupId && it.role == UserRole.GROUP_ADMIN && it.username != username }
            .forEach { update(it.copy(role = UserRole.OPERATOR, securityVersion = it.securityVersion + 1)) }
        return update(target.copy(role = UserRole.GROUP_ADMIN, active = true, securityVersion = target.securityVersion + 1))
    }
}

class CachedAuthUserRepository(
    private val delegate: AuthUserRepository,
) : AuthUserRepository {
    private val usersByUsername = ConcurrentHashMap<String, AuthUser>()
    private val usersByEmail = ConcurrentHashMap<String, AuthUser>()

    override fun findByUsername(username: String): AuthUser? =
        usersByUsername[username] ?: delegate.findByUsername(username)?.also(::cache)

    override fun findByEmail(email: String): AuthUser? {
        val normalizedEmail = email.lowercase()
        return usersByEmail[normalizedEmail] ?: delegate.findByEmail(email)?.also(::cache)
    }

    @Synchronized
    override fun save(user: AuthUser): AuthUser =
        delegate.save(user).also(::cache)

    override fun list(): List<AuthUser> = delegate.list().onEach(::cache)

    @Synchronized
    override fun update(user: AuthUser): AuthUser =
        delegate.update(user).also(::cache)

    @Synchronized
    override fun replaceGroupAdmin(groupId: GroupId, username: String): AuthUser {
        val replaced = delegate.replaceGroupAdmin(groupId, username)
        delegate.list().filter { it.groupId == groupId }.forEach(::cache)
        return replaced
    }

    private fun cache(user: AuthUser) {
        usersByUsername[user.username] = user
        usersByEmail[user.email.lowercase()] = user
    }
}
