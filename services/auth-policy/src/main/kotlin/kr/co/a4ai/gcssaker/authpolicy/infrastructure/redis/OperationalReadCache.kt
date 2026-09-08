package kr.co.a4ai.gcssaker.authpolicy.infrastructure.redis

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import java.security.MessageDigest
import java.util.concurrent.ThreadLocalRandom

class RedisOperationalReadRepository(
    private val delegate: OperationalReadRepository,
    private val store: StringKeyValueStore,
    private val objectMapper: ObjectMapper,
    private val policy: RedisCachePolicy = RedisCachePolicy.OPERATIONAL_READ,
    private val jitterSource: () -> Double = { ThreadLocalRandom.current().nextDouble() },
) : OperationalReadRepository {
    override fun telemetryFor(principal: AuthenticatedPrincipal, limit: Int, offset: Int): List<TelemetryReadModel> =
        delegate.telemetryFor(principal, limit, offset)

    override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel =
        delegate.upsertTelemetry(telemetry)

    override fun telemetryHistoryFor(
        principal: AuthenticatedPrincipal,
        uuid: String,
        limit: Int,
    ): List<TelemetryHistoryReadModel> =
        delegate.telemetryHistoryFor(principal, uuid, limit)

    override fun assetsForGateway(
        principal: AuthenticatedPrincipal, gatewayUuid: String, limit: Int, offset: Int,
    ): List<AssetReadModel> = delegate.assetsForGateway(principal, gatewayUuid, limit, offset)

    override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel =
        delegate.recordServerHealthSnapshot(snapshot)

    override fun serverHealthSnapshotsFor(
        principal: AuthenticatedPrincipal,
        limit: Int,
    ): List<ServerHealthSnapshotReadModel> =
        delegate.serverHealthSnapshotsFor(principal, limit)

    override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel =
        delegate.recordStreamSession(session).also {
            invalidateStreamSessionCache(it.groupId)
        }

    override fun streamSessionsFor(principal: AuthenticatedPrincipal, limit: Int, offset: Int): List<StreamSessionReadModel> {
        if (!policy.cacheable || limit != DEFAULT_STREAM_SESSION_PAGE_SIZE || offset != 0) {
            return delegate.streamSessionsFor(principal, limit, offset)
        }
        val key = streamSessionCacheKey(principal)
        readCachedStreamSessions(key)?.let { return it }
        return runCatching { delegate.streamSessionsFor(principal, limit, offset) }
            .onSuccess { sessions -> writeCachedStreamSessions(key, sessions) }
            .getOrElse { cause ->
                readCachedStreamSessions(staleCacheKey(key)) ?: throw cause
            }
    }

    private fun readCachedStreamSessions(key: String): List<StreamSessionReadModel>? =
        runCatching { store.get(key) }
            .getOrNull()
            ?.let { cached ->
                runCatching { objectMapper.readValue(cached, streamSessionListType) }.getOrNull()
            }

    private fun writeCachedStreamSessions(key: String, sessions: List<StreamSessionReadModel>) {
        runCatching {
            val payload = objectMapper.writeValueAsString(sessions)
            store.set(key, payload, policy.jitteredTtl(jitterSource()))
            if (policy.staleCacheable) {
                store.set(staleCacheKey(key), payload, policy.staleTtl)
            }
        }
    }

    private fun invalidateStreamSessionCache(groupId: GroupId) {
        runCatching { store.delete(streamSessionCacheKey(groupId, UserRole.OPERATOR)) }
        runCatching { store.delete(streamSessionCacheKey(groupId, UserRole.ADMIN)) }
    }

    private fun streamSessionCacheKey(principal: AuthenticatedPrincipal): String =
        streamSessionCacheKey(principal.groupId, principal.role)

    private fun streamSessionCacheKey(groupId: GroupId, role: UserRole): String {
        val raw = listOf(StreamSessionCacheContract.KIND, role.name, groupId.value).joinToString(StreamSessionCacheContract.SEPARATOR)
        return "${policy.keyPrefix}${sha256(raw)}"
    }

    private fun staleCacheKey(key: String): String {
        val digest = key.removePrefix(policy.keyPrefix)
        return "${policy.staleKeyPrefix}$digest"
    }

    private companion object {
        const val DEFAULT_STREAM_SESSION_PAGE_SIZE = 200
        val streamSessionListType = object : TypeReference<List<StreamSessionReadModel>>() {}

        fun sha256(value: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray())
                .joinToString("") { "%02x".format(it) }
    }
}

private object StreamSessionCacheContract {
    const val KIND = "stream-sessions"
    const val SEPARATOR = "|"
}
