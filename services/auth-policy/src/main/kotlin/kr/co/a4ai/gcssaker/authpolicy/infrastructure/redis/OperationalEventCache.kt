package kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import java.security.MessageDigest
import java.time.Duration
import java.util.concurrent.ThreadLocalRandom

class RedisOperationalEventRepository(
    private val delegate: OperationalEventRepository,
    private val store: StringKeyValueStore,
    private val objectMapper: ObjectMapper,
    private val policy: RedisCachePolicy = RedisCachePolicy.OPERATIONAL_EVENTS,
    private val jitterSource: () -> Double = { ThreadLocalRandom.current().nextDouble() },
) : OperationalEventRepository {
    override fun eventsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventReadModel> {
        if (!policy.cacheable) {
            return delegate.eventsFor(principal, query)
        }
        val key = cacheKey(principal, query)
        readCachedEvents(key)?.let { return it }

        return runCatching { delegate.eventsFor(principal, query) }
            .onSuccess { events ->
                writeCachedEvents(key, events)
            }
            .getOrElse { cause ->
                readCachedEvents(staleCacheKey(key)) ?: throw cause
            }
    }

    private fun readCachedEvents(key: String): List<OperationalEventReadModel>? {
        return runCatching { store.get(key) }
            .getOrNull()
            ?.let { cached ->
                runCatching {
                    objectMapper.readValue(cached, eventListType)
                }.getOrNull()
            }
    }

    private fun writeCachedEvents(key: String, events: List<OperationalEventReadModel>) {
        runCatching {
            val payload = objectMapper.writeValueAsString(events)
            store.set(key, payload, policy.jitteredTtl(jitterSource()))
            if (policy.staleCacheable) {
                store.set(staleCacheKey(key), payload, policy.staleTtl)
            }
        }
    }

    private fun staleCacheKey(key: String): String {
        val digest = key.removePrefix(policy.keyPrefix)
        return "${policy.staleKeyPrefix}$digest"
    }

    override fun eventPageFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventPageQuery,
    ): OperationalEventPage =
        delegate.eventPageFor(principal, query)

    override fun append(event: OperationalEventReadModel) {
        delegate.append(event)
    }

    override fun metricsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): OperationalEventMetrics =
        delegate.metricsFor(principal, query)

    private fun cacheKey(principal: AuthenticatedPrincipal, query: OperationalEventQuery): String {
        val raw = listOf(
            principal.username,
            principal.role.name,
            principal.groupId.value,
            query.query.orEmpty(),
            query.severity.orEmpty(),
            query.from?.toString().orEmpty(),
            query.to?.toString().orEmpty(),
        ).joinToString("|")
        return "${policy.keyPrefix}${sha256(raw)}"
    }

    private companion object {
        val eventListType = object : TypeReference<List<OperationalEventReadModel>>() {}

        fun sha256(value: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray())
                .joinToString("") { "%02x".format(it) }
    }
}

data class RedisCachePolicy(
    val keyPrefix: String,
    val ttl: Duration,
    val staleKeyPrefix: String = "${keyPrefix}stale:",
    val staleTtl: Duration = ttl.multipliedBy(12),
    val ttlJitterRatio: Double = 0.0,
) {
    val cacheable: Boolean = !ttl.isZero && !ttl.isNegative
    val staleCacheable: Boolean = !staleTtl.isZero && !staleTtl.isNegative

    fun jitteredTtl(jitter: Double): Duration {
        if (!cacheable || ttlJitterRatio <= 0.0) return ttl
        val boundedJitter = jitter.coerceIn(0.0, 1.0)
        val maxJitterMillis = (ttl.toMillis() * ttlJitterRatio).toLong().coerceAtLeast(0)
        return ttl.plusMillis((maxJitterMillis * boundedJitter).toLong())
    }

    companion object {
        val OPERATIONAL_EVENTS = RedisCachePolicy(
            keyPrefix = "gcs:ops-events:",
            ttl = Duration.ZERO,
            staleTtl = Duration.ZERO,
        )
        val OPERATIONAL_READ = RedisCachePolicy(
            keyPrefix = "gcs:ops-read:",
            ttl = Duration.ofSeconds(3),
            staleTtl = Duration.ofSeconds(30),
            ttlJitterRatio = 0.2,
        )
    }
}
