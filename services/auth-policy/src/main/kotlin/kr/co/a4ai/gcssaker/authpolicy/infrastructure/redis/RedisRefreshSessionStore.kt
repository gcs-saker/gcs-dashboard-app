package kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.data.redis.core.StringRedisTemplate
import java.security.MessageDigest
import java.time.Duration

class RedisRefreshSessionStore(
    private val store: StringKeyValueStore,
    private val keyPrefix: String = "gcs-saker:auth-policy:refresh-session:",
) : RefreshSessionStore {
    private val userIndexPrefix = "${keyPrefix}user:"
    constructor(
        redis: StringRedisTemplate,
        keyPrefix: String = "gcs-saker:auth-policy:refresh-session:",
    ) : this(RedisTemplateStringKeyValueStore(redis), keyPrefix)

    override val authoritative: Boolean = true

    @Synchronized
    override fun putRefreshSession(
        refreshToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) {
        if (ttl.isZero || ttl.isNegative) {
            return
        }
        val tokenKey = cacheKey(refreshToken)
        store.set(tokenKey, encode(principal), ttl)
        val indexKey = userIndexKey(principal.username)
        val keys = decodeIndex(store.get(indexKey)) + tokenKey
        store.set(indexKey, keys.joinToString("\n"), ttl)
    }

    override fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal? {
        val key = cacheKey(refreshToken)
        val encoded = store.getAndDelete(key) ?: return null
        return decode(encoded)
    }

    override fun revokeRefreshSession(refreshToken: String) {
        store.delete(cacheKey(refreshToken))
    }

    @Synchronized
    override fun revokePrincipalSessions(username: String) {
        val indexKey = userIndexKey(username)
        decodeIndex(store.get(indexKey)).forEach(store::delete)
        store.delete(indexKey)
    }

    private fun cacheKey(refreshToken: String): String =
        keyPrefix + sha256(refreshToken)

    private fun userIndexKey(username: String): String = userIndexPrefix + sha256(username.trim().lowercase())

    private fun decodeIndex(value: String?): Set<String> =
        value?.lineSequence()?.filter { it.startsWith(keyPrefix) }?.toSet().orEmpty()

    private fun encode(principal: AuthenticatedPrincipal): String =
        listOf(principal.username, principal.role.name, principal.groupId.value, principal.securityVersion).joinToString("\t")

    private fun decode(value: String): AuthenticatedPrincipal? {
        val parts = value.split("\t")
        if (parts.size !in 3..4) {
            return null
        }
        val role = runCatching { UserRole.valueOf(parts[1]) }.getOrNull() ?: return null
        return AuthenticatedPrincipal(
            username = parts[0],
            role = role,
            groupId = GroupId(parts[2]),
            securityVersion = parts.getOrNull(3)?.toLongOrNull() ?: 1,
        )
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
