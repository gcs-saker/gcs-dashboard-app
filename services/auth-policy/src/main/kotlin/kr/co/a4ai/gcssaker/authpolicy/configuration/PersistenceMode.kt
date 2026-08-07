package kr.co.a4ai.gcssaker.authpolicy.configuration

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import javax.sql.DataSource

internal object PersistenceMode {
    private val logger = LoggerFactory.getLogger(PersistenceMode::class.java)

    fun dataSource(settings: AuthRuntimeSettings, provider: ObjectProvider<DataSource>): DataSource? {
        if (!settings.jdbcPersistenceEnabled) {
            check(settings.inMemoryPersistenceAllowed) {
                "In-memory persistence is restricted to local, dev, and test profiles"
            }
            logger.warn("auth_repository_mode=in_memory durable=false")
            return null
        }

        val dataSource = provider.getIfAvailable()
            ?: error("JDBC persistence is enabled but no DataSource is configured")
        val reachable = runCatching {
            dataSource.connection.use { it.isValid(2) }
        }.getOrElse { cause ->
            throw IllegalStateException("JDBC persistence is enabled but the DataSource is unavailable", cause)
        }
        check(reachable) { "JDBC persistence is enabled but the DataSource connection is invalid" }
        logger.info("auth_repository_mode=jdbc durable=true")
        return dataSource
    }
}
