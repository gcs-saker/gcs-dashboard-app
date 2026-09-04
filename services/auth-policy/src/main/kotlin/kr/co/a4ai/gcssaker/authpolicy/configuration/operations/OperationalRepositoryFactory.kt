package kr.co.a4ai.gcssaker.authpolicy.configuration

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisCachePolicy
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis.RedisTemplateStringKeyValueStore
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import javax.sql.DataSource

data class OperationalReadDependencies(
    val dataSource: ObjectProvider<DataSource>,
    val redisTemplate: ObjectProvider<StringRedisTemplate>,
    val objectMapper: ObjectMapper,
    val hierarchy: OrganizationHierarchyRepository,
)

internal fun createOperationalReadRepository(
    settings: AuthRuntimeSettings,
    dependencies: OperationalReadDependencies,
): OperationalReadRepository {
    val seeds = seedOperationalReadModels()
    val repository = PersistenceMode.dataSource(settings, dependencies.dataSource)?.let {
        JdbcOperationalReadRepository(it, seeds.telemetry, seeds.assetsByGateway)
    } ?: run {
        InMemoryOperationalReadRepository(seeds.telemetry, seeds.assetsByGateway, dependencies.hierarchy)
    }
    return dependencies.redisTemplate.getIfAvailable()
        ?.takeIf { settings.redisOperationalReadCacheEnabled }
        ?.let { RedisOperationalReadRepository(repository, RedisTemplateStringKeyValueStore(it), dependencies.objectMapper, readPolicy(settings)) }
        ?: repository
}

internal fun createOperationalEventRepository(
    settings: AuthRuntimeSettings,
    dataSource: ObjectProvider<DataSource>,
): OperationalEventRepository {
    val initialEvents = seedOperationalEvents()
    val repository = PersistenceMode.dataSource(settings, dataSource)?.let {
        JdbcOperationalEventRepository(it, initialEvents)
    } ?: run {
        InMemoryOperationalEventRepository(initialEvents)
    }
    return repository
}

private fun readPolicy(settings: AuthRuntimeSettings): RedisCachePolicy =
    RedisCachePolicy(
        keyPrefix = settings.operationalReadCacheKeyPrefix,
        ttl = Duration.ofSeconds(settings.operationalReadCacheTtlSeconds),
        staleKeyPrefix = settings.operationalReadStaleCacheKeyPrefix,
        staleTtl = Duration.ofSeconds(settings.operationalReadStaleCacheTtlSeconds),
        ttlJitterRatio = settings.operationalReadCacheTtlJitterRatio,
    )
