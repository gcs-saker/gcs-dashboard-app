package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

data class TelemetryReadModel(
    val uuid: String,
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val magneticX: Double,
    val magneticY: Double,
    val magneticZ: Double,
    val soc: String,
    val phoneBatterySOC: Double,
    val velocity: Double,
    val totalDistance: Double,
    val epochTime: String,
    val portDistance: Double,
    val groupId: GroupId,
    val batteryPercent: Double? = null,
    val headingDeg: Double? = null,
    val rollDeg: Double? = null,
    val pitchDeg: Double? = null,
    val yawDeg: Double? = null,
    val linkQualityPercent: Double? = null,
    val observedAt: Instant? = null,
)

data class TelemetryHistoryReadModel(
    val recordedAt: Instant,
    val telemetry: TelemetryReadModel,
)

data class AssetReadModel(
    val id: Int,
    val cid: String,
    val uuid: String,
    val companyId: Int,
    val type: String,
    val name: String,
    val description: String?,
    val imageUrl: String?,
    val status: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val groupId: GroupId,
)

data class ServerHealthSnapshotReadModel(
    val serviceName: String,
    val status: String,
    val checkedAt: Instant,
    val latencyMs: Long?,
    val message: String?,
    val groupId: GroupId,
)

data class StreamSessionReadModel(
    val streamId: String,
    val sessionId: String?,
    val status: String,
    val source: String,
    val startedAt: Instant,
    val lastHeartbeatAt: Instant,
    val stoppedAt: Instant?,
    val groupId: GroupId,
)

interface OperationalReadRepository {
    fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel>
    fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel
    fun telemetryHistoryFor(principal: AuthenticatedPrincipal, uuid: String, limit: Int): List<TelemetryHistoryReadModel>
    fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel>
    fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel
    fun serverHealthSnapshotsFor(principal: AuthenticatedPrincipal, limit: Int): List<ServerHealthSnapshotReadModel>
    fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel
    fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel>
}

class InMemoryOperationalReadRepository(
    telemetry: Collection<TelemetryReadModel>,
    private val assetsByGateway: Map<String, List<AssetReadModel>>,
) : OperationalReadRepository {
    private val telemetryByUuid = ConcurrentHashMap(telemetry.associateBy { it.uuid })
    private val telemetryHistory = ConcurrentHashMap<String, List<TelemetryHistoryReadModel>>().apply {
        telemetry.forEach { item ->
            put(item.uuid, listOf(TelemetryHistoryReadModel(Instant.EPOCH, item)))
        }
    }

    override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> =
        telemetryByUuid.values
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .sortedBy { it.uuid }

    override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        telemetryByUuid[telemetry.uuid] = telemetry
        telemetryHistory.compute(telemetry.uuid) { _, current ->
            current.orEmpty() + TelemetryHistoryReadModel(Instant.now(), telemetry)
        }
        return telemetry
    }

    override fun telemetryHistoryFor(
        principal: AuthenticatedPrincipal,
        uuid: String,
        limit: Int,
    ): List<TelemetryHistoryReadModel> =
        telemetryHistory[uuid].orEmpty()
            .asSequence()
            .filter { it.telemetry.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .sortedByDescending { it.recordedAt }
            .take(limit.coerceIn(1, 500))
            .toList()

    override fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel> =
        assetsByGateway[gatewayUuid].orEmpty()
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .sortedBy { it.uuid }

    private val serverHealthSnapshots = java.util.concurrent.CopyOnWriteArrayList<ServerHealthSnapshotReadModel>()
    private val streamSessionHistory = java.util.concurrent.CopyOnWriteArrayList<StreamSessionReadModel>()

    override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel {
        serverHealthSnapshots.add(snapshot)
        return snapshot
    }

    override fun serverHealthSnapshotsFor(
        principal: AuthenticatedPrincipal,
        limit: Int,
    ): List<ServerHealthSnapshotReadModel> =
        serverHealthSnapshots
            .asSequence()
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .sortedByDescending { it.checkedAt }
            .take(limit.coerceIn(1, 500))
            .toList()

    override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel {
        streamSessionHistory.add(session)
        return session
    }

    override fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel> =
        streamSessionHistory
            .asSequence()
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .groupBy { "${it.streamId}|${it.sessionId.orEmpty()}" }
            .values
            .map { sessions -> sessions.maxBy { it.lastHeartbeatAt } }
            .sortedWith(compareBy<StreamSessionReadModel> { it.status }.thenBy { it.streamId })
            .toList()
}
