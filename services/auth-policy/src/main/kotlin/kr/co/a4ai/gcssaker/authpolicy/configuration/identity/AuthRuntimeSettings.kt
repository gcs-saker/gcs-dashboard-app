package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceBootstrapTokens
import org.springframework.core.env.Environment

data class AuthRuntimeSettings(
    val jwtSecret: String,
    val jwtIssuer: String,
    val accessTokenExpireMinutes: Long,
    val refreshTokenExpireMinutes: Long,
    val absoluteSessionExpireMinutes: Long,
    val refreshCookieName: String,
    val refreshCookieSecure: Boolean,
    val refreshCookieSameSite: String,
    val allowedOrigins: AllowedOrigins,
    val adminUsername: String,
    val adminPassword: String,
    val adminCompanyId: Int,
    val adminGroupId: String,
    val operatorUsername: String,
    val operatorPassword: String,
    val operatorCompanyId: Int,
    val operatorGroupId: String,
    val smokeUsername: String,
    val smokePassword: String,
    val smokeCompanyId: Int,
    val smokeGroupId: String,
    val signupInvites: SignupInvites,
    val deviceBootstrapTokens: DeviceBootstrapTokens = DeviceBootstrapTokens.empty(),
    val redisPrincipalCacheEnabled: Boolean = true,
    val redisRefreshSessionEnabled: Boolean = true,
    val jdbcPersistenceEnabled: Boolean = true,
    val inMemoryPersistenceAllowed: Boolean = true,
    val l1AuthUserCacheEnabled: Boolean = true,
    val redisOperationalEventCacheEnabled: Boolean = true,
    val operationalEventCacheKeyPrefix: String = AuthRuntimeDefaults.OPERATIONAL_EVENT_CACHE_KEY_PREFIX,
    val operationalEventCacheTtlSeconds: Long = AuthRuntimeDefaults.OPERATIONAL_EVENT_CACHE_TTL_SECONDS,
    val operationalEventStaleCacheKeyPrefix: String = AuthRuntimeDefaults.OPERATIONAL_EVENT_STALE_CACHE_KEY_PREFIX,
    val operationalEventStaleCacheTtlSeconds: Long = AuthRuntimeDefaults.OPERATIONAL_EVENT_STALE_CACHE_TTL_SECONDS,
    val operationalEventCacheTtlJitterRatio: Double = AuthRuntimeDefaults.CACHE_TTL_JITTER_RATIO,
    val redisOperationalReadCacheEnabled: Boolean = true,
    val operationalReadCacheKeyPrefix: String = AuthRuntimeDefaults.OPERATIONAL_READ_CACHE_KEY_PREFIX,
    val operationalReadCacheTtlSeconds: Long = AuthRuntimeDefaults.OPERATIONAL_READ_CACHE_TTL_SECONDS,
    val operationalReadStaleCacheKeyPrefix: String = AuthRuntimeDefaults.OPERATIONAL_READ_STALE_CACHE_KEY_PREFIX,
    val operationalReadStaleCacheTtlSeconds: Long = AuthRuntimeDefaults.OPERATIONAL_READ_STALE_CACHE_TTL_SECONDS,
    val operationalReadCacheTtlJitterRatio: Double = AuthRuntimeDefaults.CACHE_TTL_JITTER_RATIO,
    val authRateLimitEnabled: Boolean = true,
    val authRateLimitPerMinute: Int = AuthRuntimeDefaults.AUTH_RATE_LIMIT_PER_MINUTE,
    val asyncPostProcessingEnabled: Boolean = true,
    val postProcessingCorePoolSize: Int = AuthRuntimeDefaults.POST_PROCESSING_CORE_POOL_SIZE,
    val postProcessingMaxPoolSize: Int = AuthRuntimeDefaults.POST_PROCESSING_MAX_POOL_SIZE,
    val postProcessingQueueCapacity: Int = AuthRuntimeDefaults.POST_PROCESSING_QUEUE_CAPACITY,
) {
    init {
        require(accessTokenExpireMinutes > 0) { "access token expiry must be positive" }
        require(refreshTokenExpireMinutes >= accessTokenExpireMinutes) { "refresh token expiry must not be shorter than access token expiry" }
        require(absoluteSessionExpireMinutes >= refreshTokenExpireMinutes) { "absolute session expiry must not be shorter than refresh token expiry" }
        require(!refreshCookieSameSite.equals("none", ignoreCase = true) || refreshCookieSecure) {
            "SameSite=None refresh cookies require Secure=true"
        }
    }

    companion object {
        fun fromEnvironment(env: Environment): AuthRuntimeSettings =
            AuthRuntimeSettingsReader.fromEnvironment(env)
    }
}

class AllowedOrigins private constructor(
    private val values: Set<String>,
) {
    operator fun contains(origin: String): Boolean = origin in values

    fun isEmpty(): Boolean = values.isEmpty()

    fun toSet(): Set<String> = values

    companion object {
        fun of(origins: Collection<String>): AllowedOrigins =
            AllowedOrigins(
                origins
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet(),
            )
    }
}
