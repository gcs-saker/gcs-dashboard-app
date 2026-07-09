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

    private fun cache(user: AuthUser) {
        usersByUsername[user.username] = user
        usersByEmail[user.email.lowercase()] = user
    }
}
