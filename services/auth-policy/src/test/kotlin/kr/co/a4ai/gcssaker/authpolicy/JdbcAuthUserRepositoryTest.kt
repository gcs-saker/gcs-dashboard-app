package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.CachedAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.h2.jdbcx.JdbcDataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull

class JdbcAuthUserRepositoryTest {
    @Test
    fun `jdbc repository persists seeded and signed up users`() {
        val repository = JdbcAuthUserRepository(
            h2DataSource(),
            listOf(seedUser(1, "operator01", "operator@example.test")),
        )

        assertNotNull(repository.findByUsername("operator01"))

        val saved = repository.save(seedUser(0, "field01", "field01@example.test"))

        assertEquals(2, saved.id)
        assertEquals("field01", repository.findByEmail("FIELD01@example.test")?.username)
    }

    @Test
    fun `jdbc repository enforces unique username and email`() {
        val repository = JdbcAuthUserRepository(
            h2DataSource(),
            listOf(seedUser(1, "operator01", "operator@example.test")),
        )

        assertFailsWith<IllegalArgumentException> {
            repository.save(seedUser(0, "operator01", "other@example.test"))
        }
        assertFailsWith<IllegalArgumentException> {
            repository.save(seedUser(0, "other", "operator@example.test"))
        }
    }

    @Test
    fun `l1 auth user cache avoids repeated delegate lookups`() {
        val delegate = RecordingAuthUserRepository(seedUser(1, "operator01", "operator@example.test"))
        val cached = CachedAuthUserRepository(delegate)

        assertEquals("operator01", cached.findByUsername("operator01")?.username)
        assertEquals("operator01", cached.findByUsername("operator01")?.username)
        assertEquals(1, delegate.usernameReads)

        assertEquals("operator01", cached.findByEmail("operator@example.test")?.username)
        assertEquals("operator01", cached.findByEmail("OPERATOR@example.test")?.username)
        assertEquals(0, delegate.emailReads)
    }

    private fun h2DataSource(): JdbcDataSource =
        JdbcDataSource().apply {
            setURL("jdbc:h2:mem:auth_policy_${System.nanoTime()};MODE=MySQL;DB_CLOSE_DELAY=-1")
            user = "sa"
            password = ""
        }

    private fun seedUser(id: Int, username: String, email: String): AuthUser =
        AuthUser(
            id = id,
            username = username,
            email = email,
            passwordHash = "hash-$username",
            companyId = 1,
            role = UserRole.OPERATOR,
            groupId = GroupId("co-a"),
        )

    private class RecordingAuthUserRepository(
        private val user: AuthUser,
    ) : AuthUserRepository {
        var usernameReads = 0
        var emailReads = 0

        override fun findByUsername(username: String): AuthUser? {
            usernameReads += 1
            return user.takeIf { it.username == username }
        }

        override fun findByEmail(email: String): AuthUser? {
            emailReads += 1
            return user.takeIf { it.email.equals(email, ignoreCase = true) }
        }

        override fun save(user: AuthUser): AuthUser = user
    }
}
