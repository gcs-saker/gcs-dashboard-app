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

interface OperationalReadRepository {
    fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel>
    fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel
    fun telemetryHistoryFor(principal: AuthenticatedPrincipal, uuid: String, limit: Int): List<TelemetryHistoryReadModel>
    fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel>
}

class InMemoryOperationalReadRepository(
    telemetry: Collection<TelemetryReadModel>,
    private val assetsByGateway: Map<String, List<AssetReadModel>>,
) : OperationalReadRepository {
    private val telemetryByUuid = ConcurrentHashMap(telemetry.associateBy { it.uuid })
    private val telemetryHistory = ConcurrentHashMap<String, MutableList<TelemetryHistoryReadModel>>().apply {
        telemetry.forEach { item ->
            put(item.uuid, mutableListOf(TelemetryHistoryReadModel(Instant.EPOCH, item)))
        }
    }

    override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> =
        telemetryByUuid.values
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .sortedBy { it.uuid }

    override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        telemetryByUuid[telemetry.uuid] = telemetry
        telemetryHistory.compute(telemetry.uuid) { _, current ->
            (current ?: mutableListOf()).apply {
                add(TelemetryHistoryReadModel(Instant.now(), telemetry))
            }
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
}
