package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import javax.sql.DataSource

class AuthPolicyDatabaseInitializer(private val dataSource: DataSource) {
    fun initializeSchema() {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }

    fun alignGeneratedIdentity() {
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
}
