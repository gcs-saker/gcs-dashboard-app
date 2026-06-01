package kr.co.a4ai.gcssaker.authpolicy

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
    constructor(
        redis: StringRedisTemplate,
        keyPrefix: String = "gcs-saker:auth-policy:refresh-session:",
    ) : this(RedisTemplateStringKeyValueStore(redis), keyPrefix)

    override val authoritative: Boolean = true

    override fun putRefreshSession(
        refreshToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) {
        if (ttl.isZero || ttl.isNegative) {
            return
        }
        store.set(cacheKey(refreshToken), encode(principal), ttl)
    }

    override fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal? {
        val key = cacheKey(refreshToken)
        val encoded = store.getAndDelete(key) ?: return null
        return decode(encoded)
    }

    override fun revokeRefreshSession(refreshToken: String) {
        store.delete(cacheKey(refreshToken))
    }

    private fun cacheKey(refreshToken: String): String =
        keyPrefix + sha256(refreshToken)

    private fun encode(principal: AuthenticatedPrincipal): String =
        listOf(principal.username, principal.role.name, principal.groupId.value).joinToString("\t")

    private fun decode(value: String): AuthenticatedPrincipal? {
        val parts = value.split("\t")
        if (parts.size != 3) {
            return null
        }
        val role = runCatching { UserRole.valueOf(parts[1]) }.getOrNull() ?: return null
        return AuthenticatedPrincipal(
            username = parts[0],
            role = role,
            groupId = GroupId(parts[2]),
        )
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
