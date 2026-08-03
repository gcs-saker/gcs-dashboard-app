package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.DuplicateAuthUserException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.dao.DuplicateKeyException
import javax.sql.DataSource

class JdbcAuthUserRepository(
    dataSource: DataSource,
    initialUsers: Collection<AuthUser>,
) : AuthUserRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val isPostgres = dataSource.connection.use { it.metaData.databaseProductName.equals("PostgreSQL", true) }

    init {
        AuthPolicySchema.ensure(dataSource)
        ensurePostgresIdentity(dataSource)
        seedUsers(initialUsers)
    }

    override fun findByUsername(username: String): AuthUser? =
        jdbc.query(AuthUserSql.selectByUsername, authUserRowMapper, username).firstOrNull()

    override fun findByEmail(email: String): AuthUser? =
        jdbc.query(AuthUserSql.selectByEmail, authUserRowMapper, email.lowercase()).firstOrNull()

    override fun save(user: AuthUser): AuthUser {
        try {
            return insertUser(user)
        } catch (exception: DuplicateKeyException) {
            throw DuplicateAuthUserException("Username or email already registered", exception)
        }
    }

    private fun insertUser(user: AuthUser): AuthUser {
        if (user.id > 0) {
            jdbc.update(AuthUserSql.insertWithId, user.id, user.username, user.email.lowercase(),
                user.passwordHash, user.companyId, user.role.name, user.groupId.value)
            return user
        }
        if (!isPostgres) {
            val generatedId = (jdbc.queryForObject(AuthUserSql.maxId, Int::class.java) ?: 0) + 1
            val saved = user.copy(id = generatedId)
            jdbc.update(AuthUserSql.insertWithId, saved.id, saved.username, saved.email.lowercase(),
                saved.passwordHash, saved.companyId, saved.role.name, saved.groupId.value)
            return saved
        }
        val generatedId = jdbc.queryForObject(
            AuthUserSql.insertGenerated,
            Int::class.java,
            user.username,
            user.email.lowercase(),
            user.passwordHash,
            user.companyId,
            user.role.name,
            user.groupId.value,
        ) ?: error("Database did not return a generated user id")
        return user.copy(id = generatedId)
    }

    private fun seedUsers(initialUsers: Collection<AuthUser>) {
        initialUsers.forEach { user ->
            if (findByUsername(user.username) == null && findByEmail(user.email) == null) {
                jdbc.update(
                    AuthUserSql.insertWithId,
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

    private fun ensurePostgresIdentity(dataSource: DataSource) {
        dataSource.connection.use { connection ->
            if (!connection.metaData.databaseProductName.equals("PostgreSQL", ignoreCase = true)) return
            connection.createStatement().use { statement ->
                statement.execute(
                    "SELECT setval(pg_get_serial_sequence('auth_users', 'id'), " +
                        "COALESCE((SELECT MAX(id) FROM auth_users), 1), EXISTS (SELECT 1 FROM auth_users))",
                )
            }
        }
    }

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
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
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
    const val insertWithId = """
        INSERT INTO auth_users (id, username, email, password_hash, company_id, role, group_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    const val insertGenerated = """
        INSERT INTO auth_users (username, email, password_hash, company_id, role, group_id)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
    """
    const val maxId = "SELECT COALESCE(MAX(id), 0) FROM auth_users"
}
