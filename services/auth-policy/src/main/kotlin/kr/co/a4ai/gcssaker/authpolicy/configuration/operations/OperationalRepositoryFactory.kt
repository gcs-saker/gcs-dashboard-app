package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisCachePolicy
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisTemplateStringKeyValueStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import javax.sql.DataSource

internal fun createOperationalReadRepository(
    settings: AuthRuntimeSettings,
    dataSource: ObjectProvider<DataSource>,
    redisTemplate: ObjectProvider<StringRedisTemplate>,
    objectMapper: ObjectMapper,
): OperationalReadRepository {
    val seeds = seedOperationalReadModels()
    val repository = PersistenceMode.dataSource(settings, dataSource)?.let {
        JdbcOperationalReadRepository(it, seeds.telemetry, seeds.assetsByGateway)
    } ?: run {
        InMemoryOperationalReadRepository(seeds.telemetry, seeds.assetsByGateway)
    }
    return redisTemplate.getIfAvailable()
        ?.takeIf { settings.redisOperationalReadCacheEnabled }
        ?.let { RedisOperationalReadRepository(repository, RedisTemplateStringKeyValueStore(it), objectMapper, readPolicy(settings)) }
        ?: repository
}

internal fun createOperationalEventRepository(
    settings: AuthRuntimeSettings,
    dataSource: ObjectProvider<DataSource>,
    redisTemplate: ObjectProvider<StringRedisTemplate>,
    objectMapper: ObjectMapper,
): OperationalEventRepository {
    val initialEvents = seedOperationalEvents()
    val repository = PersistenceMode.dataSource(settings, dataSource)?.let {
        JdbcOperationalEventRepository(it, initialEvents)
    } ?: run {
        InMemoryOperationalEventRepository(initialEvents)
    }
    return redisTemplate.getIfAvailable()
        ?.takeIf { settings.redisOperationalEventCacheEnabled }
        ?.let { RedisOperationalEventRepository(repository, RedisTemplateStringKeyValueStore(it), objectMapper, eventPolicy(settings)) }
        ?: repository
}

private fun readPolicy(settings: AuthRuntimeSettings): RedisCachePolicy =
    RedisCachePolicy(
        keyPrefix = settings.operationalReadCacheKeyPrefix,
        ttl = Duration.ofSeconds(settings.operationalReadCacheTtlSeconds),
        staleKeyPrefix = settings.operationalReadStaleCacheKeyPrefix,
        staleTtl = Duration.ofSeconds(settings.operationalReadStaleCacheTtlSeconds),
        ttlJitterRatio = settings.operationalReadCacheTtlJitterRatio,
    )

private fun eventPolicy(settings: AuthRuntimeSettings): RedisCachePolicy =
    RedisCachePolicy(
        keyPrefix = settings.operationalEventCacheKeyPrefix,
        ttl = Duration.ofSeconds(settings.operationalEventCacheTtlSeconds),
        staleKeyPrefix = settings.operationalEventStaleCacheKeyPrefix,
        staleTtl = Duration.ofSeconds(settings.operationalEventStaleCacheTtlSeconds),
        ttlJitterRatio = settings.operationalEventCacheTtlJitterRatio,
    )
