package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.flywaydb.core.Flyway
import java.util.Collections
import javax.sql.DataSource

internal object AuthPolicyJdbcMigrations {
    const val LOCATION = "classpath:db/migration"

    private val migratedDataSources = Collections.synchronizedSet(mutableSetOf<String>())

    fun ensure(dataSource: DataSource) {
        val signature = migrationSignature(dataSource)
        if (!migratedDataSources.add(signature)) {
            return
        }
        Flyway.configure()
            .dataSource(dataSource)
            .locations(LOCATION)
            .baselineOnMigrate(true)
            .baselineVersion("0")
            .load()
            .migrate()
    }

    private fun migrationSignature(dataSource: DataSource): String =
        dataSource.connection.use { connection ->
            listOfNotNull(connection.metaData.url, connection.catalog, connection.schema).joinToString("|")
        }
}
