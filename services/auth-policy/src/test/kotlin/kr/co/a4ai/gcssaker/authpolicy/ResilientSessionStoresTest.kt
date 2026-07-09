package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogContract
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogger
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.StringKeyValueStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientRefreshSessionStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class ResilientSessionStoresTest {
    private val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))

    @Test
    fun `principal cache failures degrade gracefully and append operational event`() {
        val repository = InMemoryOperationalEventRepository(emptyList())
        val cache = ResilientPrincipalCache(
            delegate = RedisPrincipalCache(FailingStringKeyValueStore()),
            failureLogger = OperationalFailureLogger(repository, fixedClock()),
        )

        assertNull(cache.getAccessPrincipal(ResilientSessionStoreTestContract.ACCESS_TOKEN))
        cache.putAccessPrincipal(ResilientSessionStoreTestContract.ACCESS_TOKEN, principal, Duration.ofMinutes(1))

        val events = repository.eventsFor(ResilientSessionStoreTestContract.SYSTEM_PRINCIPAL, OperationalEventQuery())
        assertEquals(2, events.size)
        assertEquals(
            setOf(
                "${OperationalFailureLogContract.COMPONENT_REDIS}.${OperationalFailureLogContract.OPERATION_ACCESS_PRINCIPAL_GET}",
                "${OperationalFailureLogContract.COMPONENT_REDIS}.${OperationalFailureLogContract.OPERATION_ACCESS_PRINCIPAL_PUT}",
            ),
            events.mapNotNull { it.eventType }.toSet(),
        )
        assertEquals(setOf(OperationalFailureLogContract.SEVERITY_WARN), events.map { it.severity }.toSet())
    }

    @Test
    fun `refresh session consume failures fail closed and append operational event`() {
        val repository = InMemoryOperationalEventRepository(emptyList())
        val refreshSessions = ResilientRefreshSessionStore(
            delegate = RedisRefreshSessionStore(FailingStringKeyValueStore()),
            failureLogger = OperationalFailureLogger(repository, fixedClock()),
        )

        assertNull(refreshSessions.consumeRefreshSession(ResilientSessionStoreTestContract.REFRESH_TOKEN))

        val events = repository.eventsFor(ResilientSessionStoreTestContract.SYSTEM_PRINCIPAL, OperationalEventQuery())
        assertEquals(1, events.size)
        assertEquals("${OperationalFailureLogContract.COMPONENT_REDIS}.${OperationalFailureLogContract.OPERATION_REFRESH_SESSION_CONSUME}", events.single().eventType)
        assertEquals(OperationalFailureLogContract.SEVERITY_ERROR, events.single().severity)
    }

    @Test
    fun `refresh session write failures are not swallowed`() {
        val repository = InMemoryOperationalEventRepository(emptyList())
        val refreshSessions = ResilientRefreshSessionStore(
            delegate = RedisRefreshSessionStore(FailingStringKeyValueStore()),
            failureLogger = OperationalFailureLogger(repository, fixedClock()),
        )

        assertThrows(RuntimeException::class.java) {
            refreshSessions.putRefreshSession(
                ResilientSessionStoreTestContract.REFRESH_TOKEN,
                principal,
                Duration.ofMinutes(1),
            )
        }
    }

    private fun fixedClock(): () -> Instant = { ResilientSessionStoreTestContract.OCCURRED_AT }
}

private class FailingStringKeyValueStore : StringKeyValueStore {
    override fun get(key: String): String? = throw RuntimeException(ResilientSessionStoreTestContract.REDIS_DOWN)
    override fun getAndDelete(key: String): String? = throw RuntimeException(ResilientSessionStoreTestContract.REDIS_DOWN)
    override fun set(key: String, value: String, ttl: Duration) {
        throw RuntimeException(ResilientSessionStoreTestContract.REDIS_DOWN)
    }
    override fun delete(key: String) {
        throw RuntimeException(ResilientSessionStoreTestContract.REDIS_DOWN)
    }
}

private object ResilientSessionStoreTestContract {
    const val ACCESS_TOKEN = "access-token"
    const val REFRESH_TOKEN = "refresh-token"
    const val REDIS_DOWN = "redis unavailable"
    val OCCURRED_AT: Instant = Instant.parse("2026-06-29T00:00:00Z")
    val SYSTEM_PRINCIPAL = AuthenticatedPrincipal("system", UserRole.ADMIN, OperationalFailureLogContract.SYSTEM_GROUP_ID)
}
