package kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.data.redis.core.StringRedisTemplate
import java.security.MessageDigest
import java.time.Duration

class RedisPrincipalCache(
    private val store: StringKeyValueStore,
    private val keyPrefix: String = "gcs-saker:auth-policy:access-principal:",
) : PrincipalCache {
    constructor(
        redis: StringRedisTemplate,
        keyPrefix: String = "gcs-saker:auth-policy:access-principal:",
    ) : this(RedisTemplateStringKeyValueStore(redis), keyPrefix)

    override fun getAccessPrincipal(accessToken: String): AuthenticatedPrincipal? =
        store.get(cacheKey(accessToken))?.let(::decode)

    override fun putAccessPrincipal(
        accessToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) {
        if (ttl.isZero || ttl.isNegative) {
            return
        }
        store.set(cacheKey(accessToken), encode(principal), ttl)
    }

    private fun cacheKey(accessToken: String): String =
        keyPrefix + sha256(accessToken)

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
