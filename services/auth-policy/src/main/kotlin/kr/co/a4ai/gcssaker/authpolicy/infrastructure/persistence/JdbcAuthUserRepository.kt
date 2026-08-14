package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.DuplicateAuthUserException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.dao.DuplicateKeyException
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

class JdbcAuthUserRepository(
    dataSource: DataSource,
    initialUsers: Collection<AuthUser>,
) : AuthUserRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val transactions = TransactionTemplate(org.springframework.jdbc.datasource.DataSourceTransactionManager(dataSource))
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

    override fun list(): List<AuthUser> = jdbc.query(AuthUserSql.selectAll, authUserRowMapper)

    override fun update(user: AuthUser): AuthUser {
        val updated = jdbc.update(
            AuthUserSql.update,
            user.email.lowercase(), user.passwordHash, user.companyId, user.role.name,
            user.groupId.value, user.active, user.securityVersion, user.id, user.username,
        )
        check(updated == 1) { "User not found" }
        return user
    }

    override fun replaceGroupAdmin(groupId: GroupId, username: String): AuthUser =
        transactions.execute {
            val target = findByUsername(username) ?: error("User not found")
            require(target.role == UserRole.VIEWER || target.role == UserRole.OPERATOR) {
                "Replacement must be a viewer or operator"
            }
            jdbc.update(AuthUserSql.demoteGroupAdmin, UserRole.OPERATOR.name, groupId.value, username)
            update(target.copy(groupId = groupId, role = UserRole.GROUP_ADMIN, active = true, securityVersion = target.securityVersion + 1))
        } ?: error("Group administrator replacement failed")

    private fun insertUser(user: AuthUser): AuthUser {
        if (user.id > 0) {
            jdbc.update(AuthUserSql.insertWithId, user.id, user.username, user.email.lowercase(),
                user.passwordHash, user.companyId, user.role.name, user.groupId.value, user.active, user.securityVersion)
            return user
        }
        if (!isPostgres) {
            val generatedId = (jdbc.queryForObject(AuthUserSql.maxId, Int::class.java) ?: 0) + 1
            val saved = user.copy(id = generatedId)
            jdbc.update(AuthUserSql.insertWithId, saved.id, saved.username, saved.email.lowercase(),
                saved.passwordHash, saved.companyId, saved.role.name, saved.groupId.value, saved.active, saved.securityVersion)
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
            user.active,
            user.securityVersion,
        ) ?: error("Database did not return a generated user id")
        return user.copy(id = generatedId)
    }

    private fun seedUsers(initialUsers: Collection<AuthUser>) {
        initialUsers.forEach { user ->
            val existing = findByUsername(user.username)
            if (existing != null) {
                jdbc.update(
                    AuthUserSql.synchronizeSeed,
                    user.email.lowercase(),
                    user.passwordHash,
                    user.companyId,
                    user.role.name,
                    user.groupId.value, user.active, user.securityVersion,
                    user.username,
                )
            } else if (findByEmail(user.email) == null) {
                jdbc.update(
                    AuthUserSql.insertWithId,
                    user.id,
                    user.username,
                    user.email.lowercase(),
                    user.passwordHash,
                    user.companyId,
                    user.role.name,
                    user.groupId.value, user.active, user.securityVersion,
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
                active = rs.getBoolean(AuthUserColumns.active),
                securityVersion = rs.getLong(AuthUserColumns.securityVersion),
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
    const val active = "active"
    const val securityVersion = "security_version"
}

private object AuthUserSql {
    const val selectByUsername = """
        SELECT id, username, email, password_hash, company_id, role, group_id, active, security_version
        FROM auth_users
        WHERE username = ?
    """
    const val selectByEmail = """
        SELECT id, username, email, password_hash, company_id, role, group_id, active, security_version
        FROM auth_users
        WHERE email = ?
    """
    const val insertWithId = """
        INSERT INTO auth_users (id, username, email, password_hash, company_id, role, group_id, active, security_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertGenerated = """
        INSERT INTO auth_users (username, email, password_hash, company_id, role, group_id, active, security_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
    """
    const val maxId = "SELECT COALESCE(MAX(id), 0) FROM auth_users"
    const val synchronizeSeed = """
        UPDATE auth_users
        SET email = ?, password_hash = ?, company_id = ?, role = ?, group_id = ?, active = ?, security_version = ?
        WHERE username = ?
    """
    const val selectAll = """
        SELECT id, username, email, password_hash, company_id, role, group_id, active, security_version
        FROM auth_users ORDER BY username
    """
    const val update = """
        UPDATE auth_users
        SET email = ?, password_hash = ?, company_id = ?, role = ?, group_id = ?, active = ?, security_version = ?
        WHERE id = ? AND username = ?
    """
    const val demoteGroupAdmin = """
        UPDATE auth_users
        SET role = ?, security_version = security_version + 1
        WHERE group_id = ? AND role = 'GROUP_ADMIN' AND username <> ?
    """
}
