package kr.co.a4ai.gcssaker.authpolicy.configuration

import org.springframework.core.env.Environment

object AuthRuntimeSettingsReader {
    fun fromEnvironment(env: Environment): AuthRuntimeSettings {
        val reader = RuntimeEnvReader(env)
        return AuthRuntimeSettings(
            jwtSecret = reader.requiredSecret(jwtSecretKeys, AuthRuntimeDefaults.LOCAL_JWT_SECRET),
            jwtIssuer = reader.first(AuthRuntimeEnvKeys.AUTH_POLICY_JWT_ISSUER, AuthRuntimeEnvKeys.AUTH_JWT_ISSUER)
                ?: AuthRuntimeDefaults.JWT_ISSUER,
            accessTokenExpireMinutes = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_ACCESS_TOKEN_EXPIRE_MINUTES,
                AuthRuntimeDefaults.ACCESS_TOKEN_EXPIRE_MINUTES,
            ),
            refreshTokenExpireMinutes = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_REFRESH_TOKEN_EXPIRE_MINUTES,
                AuthRuntimeDefaults.REFRESH_TOKEN_EXPIRE_MINUTES,
            ),
            refreshCookieName = reader.first(
                AuthRuntimeEnvKeys.AUTH_POLICY_REFRESH_COOKIE_NAME,
                AuthRuntimeEnvKeys.AUTH_REFRESH_COOKIE_NAME,
            ) ?: AuthRuntimeDefaults.REFRESH_COOKIE_NAME,
            refreshCookieSecure = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_REFRESH_COOKIE_SECURE, false),
            refreshCookieSameSite = reader.first(
                AuthRuntimeEnvKeys.AUTH_POLICY_REFRESH_COOKIE_SAMESITE,
                AuthRuntimeEnvKeys.AUTH_REFRESH_COOKIE_SAMESITE,
            ) ?: AuthRuntimeDefaults.REFRESH_COOKIE_SAME_SITE,
            allowedOrigins = reader.allowedOrigins(),
            operatorUsername = reader.string(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATOR_USERNAME,
                AuthRuntimeDefaults.OPERATOR_USERNAME,
            ),
            operatorPassword = reader.requiredSecret(
                listOf(AuthRuntimeEnvKeys.AUTH_POLICY_OPERATOR_PASSWORD),
                AuthRuntimeDefaults.LOCAL_OPERATOR_PASSWORD,
            ),
            operatorCompanyId = reader.int(AuthRuntimeEnvKeys.AUTH_POLICY_OPERATOR_COMPANY_ID, AuthRuntimeDefaults.COMPANY_ID),
            operatorGroupId = reader.string(AuthRuntimeEnvKeys.AUTH_POLICY_OPERATOR_GROUP_ID, AuthRuntimeDefaults.GROUP_ID),
            smokeUsername = reader.string(AuthRuntimeEnvKeys.AUTH_POLICY_SMOKE_USERNAME, AuthRuntimeDefaults.SMOKE_USERNAME),
            smokePassword = reader.requiredSecret(
                listOf(AuthRuntimeEnvKeys.AUTH_POLICY_SMOKE_PASSWORD),
                AuthRuntimeDefaults.LOCAL_SMOKE_PASSWORD,
            ),
            smokeCompanyId = reader.int(AuthRuntimeEnvKeys.AUTH_POLICY_SMOKE_COMPANY_ID, AuthRuntimeDefaults.COMPANY_ID),
            smokeGroupId = reader.string(AuthRuntimeEnvKeys.AUTH_POLICY_SMOKE_GROUP_ID, AuthRuntimeDefaults.GROUP_ID),
            signupInvites = reader.signupInvites(),
            redisPrincipalCacheEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_REDIS_PRINCIPAL_CACHE_ENABLED, true),
            redisRefreshSessionEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_REDIS_REFRESH_SESSION_ENABLED, true),
            jdbcPersistenceEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_JDBC_PERSISTENCE_ENABLED, true),
            l1AuthUserCacheEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_L1_AUTH_USER_CACHE_ENABLED, true),
            redisOperationalEventCacheEnabled = reader.bool(
                AuthRuntimeEnvKeys.AUTH_POLICY_REDIS_OPERATIONAL_EVENT_CACHE_ENABLED,
                true,
            ),
            operationalEventCacheKeyPrefix = reader.string(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_EVENT_CACHE_KEY_PREFIX,
                AuthRuntimeDefaults.OPERATIONAL_EVENT_CACHE_KEY_PREFIX,
            ),
            operationalEventCacheTtlSeconds = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_EVENT_CACHE_TTL_SECONDS,
                AuthRuntimeDefaults.OPERATIONAL_EVENT_CACHE_TTL_SECONDS,
            ),
            operationalEventStaleCacheKeyPrefix = reader.string(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_EVENT_STALE_CACHE_KEY_PREFIX,
                AuthRuntimeDefaults.OPERATIONAL_EVENT_STALE_CACHE_KEY_PREFIX,
            ),
            operationalEventStaleCacheTtlSeconds = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_EVENT_STALE_CACHE_TTL_SECONDS,
                AuthRuntimeDefaults.OPERATIONAL_EVENT_STALE_CACHE_TTL_SECONDS,
            ),
            operationalEventCacheTtlJitterRatio = reader.double(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_EVENT_CACHE_TTL_JITTER_RATIO,
                AuthRuntimeDefaults.CACHE_TTL_JITTER_RATIO,
            ),
            redisOperationalReadCacheEnabled = reader.bool(
                AuthRuntimeEnvKeys.AUTH_POLICY_REDIS_OPERATIONAL_READ_CACHE_ENABLED,
                true,
            ),
            operationalReadCacheKeyPrefix = reader.string(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_READ_CACHE_KEY_PREFIX,
                AuthRuntimeDefaults.OPERATIONAL_READ_CACHE_KEY_PREFIX,
            ),
            operationalReadCacheTtlSeconds = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_READ_CACHE_TTL_SECONDS,
                AuthRuntimeDefaults.OPERATIONAL_READ_CACHE_TTL_SECONDS,
            ),
            operationalReadStaleCacheKeyPrefix = reader.string(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_READ_STALE_CACHE_KEY_PREFIX,
                AuthRuntimeDefaults.OPERATIONAL_READ_STALE_CACHE_KEY_PREFIX,
            ),
            operationalReadStaleCacheTtlSeconds = reader.long(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_READ_STALE_CACHE_TTL_SECONDS,
                AuthRuntimeDefaults.OPERATIONAL_READ_STALE_CACHE_TTL_SECONDS,
            ),
            operationalReadCacheTtlJitterRatio = reader.double(
                AuthRuntimeEnvKeys.AUTH_POLICY_OPERATIONAL_READ_CACHE_TTL_JITTER_RATIO,
                AuthRuntimeDefaults.CACHE_TTL_JITTER_RATIO,
            ),
            authRateLimitEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_RATE_LIMIT_ENABLED, true),
            authRateLimitPerMinute = reader.int(
                AuthRuntimeEnvKeys.AUTH_POLICY_AUTH_RATE_LIMIT_PER_MINUTE,
                AuthRuntimeDefaults.AUTH_RATE_LIMIT_PER_MINUTE,
            ),
            asyncPostProcessingEnabled = reader.bool(AuthRuntimeEnvKeys.AUTH_POLICY_ASYNC_POST_PROCESSING_ENABLED, true),
            postProcessingCorePoolSize = reader.int(
                AuthRuntimeEnvKeys.AUTH_POLICY_POST_PROCESSING_CORE_POOL_SIZE,
                AuthRuntimeDefaults.POST_PROCESSING_CORE_POOL_SIZE,
            ),
            postProcessingMaxPoolSize = reader.int(
                AuthRuntimeEnvKeys.AUTH_POLICY_POST_PROCESSING_MAX_POOL_SIZE,
                AuthRuntimeDefaults.POST_PROCESSING_MAX_POOL_SIZE,
            ),
            postProcessingQueueCapacity = reader.int(
                AuthRuntimeEnvKeys.AUTH_POLICY_POST_PROCESSING_QUEUE_CAPACITY,
                AuthRuntimeDefaults.POST_PROCESSING_QUEUE_CAPACITY,
            ),
        )
    }

    private val jwtSecretKeys = listOf(AuthRuntimeEnvKeys.AUTH_POLICY_JWT_SECRET, AuthRuntimeEnvKeys.AUTH_JWT_SECRET)
}
