package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant

internal class OperationalReadSeeder(
    private val jdbc: JdbcTemplate,
    private val writer: OperationalReadJdbcWriter,
) {
    fun seedTelemetry(telemetry: Collection<TelemetryReadModel>) {
        telemetry.forEach { item ->
            if (!telemetryExists(item.uuid)) {
                writer.insertTelemetry(item)
            }
            if (!telemetryHistoryExists(item.uuid)) {
                writer.insertTelemetryHistory(item, Instant.EPOCH)
            }
        }
    }

    fun seedAssets(assetsByGateway: Map<String, List<AssetReadModel>>) {
        assetsByGateway.forEach { (gatewayUuid, assets) ->
            assets.forEach { asset ->
                if (!assetMappingExists(gatewayUuid, asset.uuid)) {
                    writer.insertAsset(gatewayUuid, asset)
                }
            }
        }
    }

    private fun telemetryExists(uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsTelemetry, Int::class.java, uuid) ?: 0) > 0

    private fun assetMappingExists(gatewayUuid: String, uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsAssetMapping, Int::class.java, gatewayUuid, uuid) ?: 0) > 0

    private fun telemetryHistoryExists(uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsTelemetryHistory, Int::class.java, uuid) ?: 0) > 0
}
