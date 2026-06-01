package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration

class RedisSessionStoreTest {
    private val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))

    @Test
    fun `principal cache stores access token hash and returns principal`() {
        val store = InMemoryStringKeyValueStore()
        val cache = RedisPrincipalCache(store, "test:access:")

        cache.putAccessPrincipal("access-token", principal, Duration.ofMinutes(30))

        assertEquals(principal, cache.getAccessPrincipal("access-token"))
        assertNull(cache.getAccessPrincipal("missing-token"))
        assertTrue(store.keys().single().startsWith("test:access:"))
        assertTrue("access-token" !in store.keys().single())
    }

    @Test
    fun `principal cache ignores malformed values`() {
        val store = InMemoryStringKeyValueStore()
        val cache = RedisPrincipalCache(store, "test:access:")
        cache.putAccessPrincipal("broken", principal, Duration.ofMinutes(1))
        store.set(store.keys().single(), "broken", Duration.ofMinutes(1))

        assertNull(cache.getAccessPrincipal("broken"))
    }

    @Test
    fun `refresh session store consumes refresh token once`() {
        val store = InMemoryStringKeyValueStore()
        val refreshSessions = RedisRefreshSessionStore(store, "test:refresh:")

        refreshSessions.putRefreshSession("refresh-token", principal, Duration.ofDays(7))

        assertTrue(refreshSessions.authoritative)
        assertEquals(principal, refreshSessions.consumeRefreshSession("refresh-token"))
        assertNull(refreshSessions.consumeRefreshSession("refresh-token"))
    }

    @Test
    fun `refresh session store revokes refresh token`() {
        val store = InMemoryStringKeyValueStore()
        val refreshSessions = RedisRefreshSessionStore(store, "test:refresh:")

        refreshSessions.putRefreshSession("refresh-token", principal, Duration.ofDays(7))
        refreshSessions.revokeRefreshSession("refresh-token")

        assertNull(refreshSessions.consumeRefreshSession("refresh-token"))
    }

    private class InMemoryStringKeyValueStore : StringKeyValueStore {
        private val values = linkedMapOf<String, String>()

        override fun get(key: String): String? = values[key]

        override fun getAndDelete(key: String): String? = values.remove(key)

        override fun set(key: String, value: String, ttl: Duration) {
            values[key] = value
        }

        override fun delete(key: String) {
            values.remove(key)
        }

        fun keys(): List<String> = values.keys.toList()
    }
}
