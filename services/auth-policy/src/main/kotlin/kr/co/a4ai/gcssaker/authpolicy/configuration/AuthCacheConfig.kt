package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.domain.NoopPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.StatelessRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience.ResilientRefreshSessionStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.core.StringRedisTemplate

@Configuration
class AuthCacheConfig {
    @Bean
    fun principalCache(
        settings: AuthRuntimeSettings,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        failureLogger: OperationalFailureLoggerFacade,
    ): PrincipalCache {
        if (!settings.redisPrincipalCacheEnabled) {
            return NoopPrincipalCache
        }
        return redisTemplate.getIfAvailable()
            ?.let { ResilientPrincipalCache(RedisPrincipalCache(it), failureLogger) }
            ?: NoopPrincipalCache
    }

    @Bean
    fun refreshSessionStore(
        settings: AuthRuntimeSettings,
        redisTemplate: ObjectProvider<StringRedisTemplate>,
        failureLogger: OperationalFailureLoggerFacade,
    ): RefreshSessionStore {
        if (!settings.redisRefreshSessionEnabled) {
            return StatelessRefreshSessionStore
        }
        return redisTemplate.getIfAvailable()
            ?.let { ResilientRefreshSessionStore(RedisRefreshSessionStore(it), failureLogger) }
            ?: StatelessRefreshSessionStore
    }
}
