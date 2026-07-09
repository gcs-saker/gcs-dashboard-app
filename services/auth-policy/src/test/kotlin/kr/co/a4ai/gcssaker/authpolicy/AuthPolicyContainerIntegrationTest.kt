package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisRefreshSessionStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.Duration
import java.time.Instant
import javax.sql.DataSource

@Testcontainers(disabledWithoutDocker = true)
class AuthPolicyContainerIntegrationTest {
    @Test
    fun `postgres container applies flyway migration and persists auth policy rows`() {
        val dataSource = postgresDataSource()
        val authUsers = JdbcAuthUserRepository(dataSource, listOf(seedUser()))
        val events = JdbcOperationalEventRepository(dataSource, emptyList())

        assertNotNull(authUsers.findByUsername(ContainerIntegrationContract.OPERATOR_USERNAME))
        events.append(operationalEvent())

        val principal = AuthenticatedPrincipal(
            username = ContainerIntegrationContract.OPERATOR_USERNAME,
            role = UserRole.OPERATOR,
            groupId = GroupId(ContainerIntegrationContract.GROUP_ID),
        )
        assertEquals(1, events.eventsFor(principal, OperationalEventQuery()).size)
        assertEquals(1, JdbcTemplate(dataSource).queryForObject(ContainerIntegrationContract.FLYWAY_VERSION_SQL, Int::class.java))
    }

    @Test
    fun `redis container stores principal cache and consumes refresh session once`() {
        val connectionFactory = LettuceConnectionFactory(redis.host, redis.getMappedPort(ContainerIntegrationContract.REDIS_PORT))
        connectionFactory.start()
        try {
            val template = StringRedisTemplate(connectionFactory)
            template.afterPropertiesSet()
            val principal = AuthenticatedPrincipal(
                username = ContainerIntegrationContract.OPERATOR_USERNAME,
                role = UserRole.OPERATOR,
                groupId = GroupId(ContainerIntegrationContract.GROUP_ID),
            )
            val principalCache = RedisPrincipalCache(template, ContainerIntegrationContract.ACCESS_KEY_PREFIX)
            val refreshSessions = RedisRefreshSessionStore(template, ContainerIntegrationContract.REFRESH_KEY_PREFIX)

            principalCache.putAccessPrincipal(ContainerIntegrationContract.ACCESS_TOKEN, principal, Duration.ofMinutes(1))
            refreshSessions.putRefreshSession(ContainerIntegrationContract.REFRESH_TOKEN, principal, Duration.ofMinutes(1))

            assertEquals(principal, principalCache.getAccessPrincipal(ContainerIntegrationContract.ACCESS_TOKEN))
            assertEquals(principal, refreshSessions.consumeRefreshSession(ContainerIntegrationContract.REFRESH_TOKEN))
            assertNull(refreshSessions.consumeRefreshSession(ContainerIntegrationContract.REFRESH_TOKEN))
        } finally {
            connectionFactory.stop()
        }
    }

    private fun postgresDataSource(): DataSource =
        DriverManagerDataSource().apply {
            setDriverClassName(ContainerIntegrationContract.POSTGRES_DRIVER)
            url = postgres.jdbcUrl
            username = postgres.username
            password = postgres.password
        }

    private fun seedUser(): AuthUser =
        AuthUser(
            id = 1,
            username = ContainerIntegrationContract.OPERATOR_USERNAME,
            email = ContainerIntegrationContract.OPERATOR_EMAIL,
            passwordHash = ContainerIntegrationContract.PASSWORD_HASH,
            companyId = 1,
            role = UserRole.OPERATOR,
            groupId = GroupId(ContainerIntegrationContract.GROUP_ID),
        )

    private fun operationalEvent(): OperationalEventReadModel =
        OperationalEventReadModel(
            id = ContainerIntegrationContract.OPERATIONAL_EVENT_ID,
            occurredAt = Instant.parse(ContainerIntegrationContract.OPERATIONAL_EVENT_AT),
            severity = ContainerIntegrationContract.SEVERITY_INFO,
            category = ContainerIntegrationContract.CATEGORY_API,
            eventType = ContainerIntegrationContract.EVENT_TYPE_SMOKE,
            sourceService = ContainerIntegrationContract.SOURCE_AUTH_POLICY,
            source = ContainerIntegrationContract.SOURCE_NAME,
            message = ContainerIntegrationContract.MESSAGE,
            connections = 1,
            latencyMs = 12,
            throughputMbps = 1.5,
            groupId = GroupId(ContainerIntegrationContract.GROUP_ID),
        )

    companion object {
        @Container
        @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(ContainerIntegrationContract.POSTGRES_IMAGE)

        @Container
        @JvmStatic
        private val redis = RedisContainer()
            .withExposedPorts(ContainerIntegrationContract.REDIS_PORT)
    }
}

private class RedisContainer : GenericContainer<RedisContainer>(ContainerIntegrationContract.REDIS_IMAGE)

private object ContainerIntegrationContract {
    const val POSTGRES_IMAGE = "postgres:16-alpine"
    const val REDIS_IMAGE = "redis:7-alpine"
    const val POSTGRES_DRIVER = "org.postgresql.Driver"
    const val REDIS_PORT = 6379
    const val OPERATOR_USERNAME = "operator01"
    const val OPERATOR_EMAIL = "operator01@example.test"
    const val PASSWORD_HASH = "hash-operator01"
    const val GROUP_ID = "co-a"
    const val ACCESS_TOKEN = "access-token"
    const val REFRESH_TOKEN = "refresh-token"
    const val ACCESS_KEY_PREFIX = "tc:access:"
    const val REFRESH_KEY_PREFIX = "tc:refresh:"
    const val OPERATIONAL_EVENT_ID = "tc-event-001"
    const val OPERATIONAL_EVENT_AT = "2026-06-29T00:00:00Z"
    const val SEVERITY_INFO = "info"
    const val CATEGORY_API = "api"
    const val EVENT_TYPE_SMOKE = "container.smoke"
    const val SOURCE_AUTH_POLICY = "auth-policy"
    const val SOURCE_NAME = "컨테이너 통합 테스트"
    const val MESSAGE = "PostgreSQL migration and Redis cache path verified"
    const val FLYWAY_VERSION_SQL = "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '1' AND success = TRUE"
}
