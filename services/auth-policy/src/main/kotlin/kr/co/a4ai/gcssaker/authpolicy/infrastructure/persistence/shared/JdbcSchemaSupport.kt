package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.flywaydb.core.Flyway
import java.util.Collections
import javax.sql.DataSource

internal object AuthPolicyJdbcMigrations {
    const val LOCATION = "classpath:db/migration"
    private const val POSTGRESQL_LOCATION = "classpath:db/postgresql-migration"
    private const val POSTGRESQL_PRODUCT_NAME = "PostgreSQL"

    private val migratedDataSources = Collections.synchronizedSet(mutableSetOf<String>())

    fun ensure(dataSource: DataSource) {
        val signature = migrationSignature(dataSource)
        if (!migratedDataSources.add(signature)) {
            return
        }
        Flyway.configure()
            .dataSource(dataSource)
            .locations(*migrationLocations(dataSource))
            .baselineOnMigrate(true)
            .baselineVersion("0")
            .load()
            .migrate()
    }

    private fun migrationLocations(dataSource: DataSource): Array<String> =
        dataSource.connection.use { connection ->
            if (connection.metaData.databaseProductName.equals(POSTGRESQL_PRODUCT_NAME, ignoreCase = true)) {
                arrayOf(LOCATION, POSTGRESQL_LOCATION)
            } else {
                arrayOf(LOCATION)
            }
        }

    private fun migrationSignature(dataSource: DataSource): String =
        dataSource.connection.use { connection ->
            listOfNotNull(connection.metaData.url, connection.catalog, connection.schema).joinToString("|")
        }
}
