package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import javax.sql.DataSource

class JdbcAuthUserRepository(
    dataSource: DataSource,
    initialUsers: Collection<AuthUser>,
) : AuthUserRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init {
        AuthPolicySchema.ensure(jdbc)
        seedUsers(initialUsers)
    }

    override fun findByUsername(username: String): AuthUser? =
        jdbc.query(AuthUserSql.selectByUsername, authUserRowMapper, username).firstOrNull()

    override fun findByEmail(email: String): AuthUser? =
        jdbc.query(AuthUserSql.selectByEmail, authUserRowMapper, email.lowercase()).firstOrNull()

    @Synchronized
    override fun save(user: AuthUser): AuthUser {
        require(findByUsername(user.username) == null) { "Username already registered" }
        require(findByEmail(user.email) == null) { "Email already registered" }
        val saved = if (user.id > 0) user else user.copy(id = nextId())
        jdbc.update(
            AuthUserSql.insert,
            saved.id,
            saved.username,
            saved.email.lowercase(),
            saved.passwordHash,
            saved.companyId,
            saved.role.name,
            saved.groupId.value,
        )
        return saved
    }

    private fun seedUsers(initialUsers: Collection<AuthUser>) {
        initialUsers.forEach { user ->
            if (findByUsername(user.username) == null && findByEmail(user.email) == null) {
                jdbc.update(
                    AuthUserSql.insert,
                    user.id,
                    user.username,
                    user.email.lowercase(),
                    user.passwordHash,
                    user.companyId,
                    user.role.name,
                    user.groupId.value,
                )
            }
        }
    }

    private fun nextId(): Int =
        (jdbc.queryForObject(AuthUserSql.nextId, Int::class.java) ?: 0) + 1

    private companion object {
        val authUserRowMapper = RowMapper<AuthUser> { rs, _ ->
            AuthUser(
                id = rs.getInt(AuthUserColumns.id),
                username = rs.getString(AuthUserColumns.username),
                email = rs.getString(AuthUserColumns.email),
                passwordHash = rs.getString(AuthUserColumns.passwordHash),
                companyId = rs.getInt(AuthUserColumns.companyId),
                role = UserRole.valueOf(rs.getString(AuthUserColumns.role)),
                groupId = GroupId(rs.getString(AuthUserColumns.groupId)),
            )
        }
    }
}

object AuthPolicySchema {
    fun ensure(jdbc: JdbcTemplate) {
        jdbc.execute(AuthUserSql.createTable)
    }
}

private object AuthUserColumns {
    const val id = "id"
    const val username = "username"
    const val email = "email"
    const val passwordHash = "password_hash"
    const val companyId = "company_id"
    const val role = "role"
    const val groupId = "group_id"
}

private object AuthUserSql {
    const val createTable = """
        CREATE TABLE IF NOT EXISTS auth_users (
            id INT NOT NULL PRIMARY KEY,
            username VARCHAR(128) NOT NULL,
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            company_id INT NOT NULL,
            role VARCHAR(32) NOT NULL,
            group_id VARCHAR(64) NOT NULL,
            CONSTRAINT ux_auth_users_username UNIQUE (username),
            CONSTRAINT ux_auth_users_email UNIQUE (email)
        )
    """
    const val selectByUsername = """
        SELECT id, username, email, password_hash, company_id, role, group_id
        FROM auth_users
        WHERE username = ?
    """
    const val selectByEmail = """
        SELECT id, username, email, password_hash, company_id, role, group_id
        FROM auth_users
        WHERE email = ?
    """
    const val insert = """
        INSERT INTO auth_users (id, username, email, password_hash, company_id, role, group_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    const val nextId = "SELECT COALESCE(MAX(id), 0) FROM auth_users"
}
