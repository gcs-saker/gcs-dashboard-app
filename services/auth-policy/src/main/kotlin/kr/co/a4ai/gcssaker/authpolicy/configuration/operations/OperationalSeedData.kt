package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import java.time.Instant

internal data class OperationalReadSeeds(
    val telemetry: List<TelemetryReadModel>,
    val assetsByGateway: Map<String, List<AssetReadModel>>,
)

internal fun seedOperationalReadModels(): OperationalReadSeeds {
    val group = GroupId(SAMPLE_GROUP_ID)
    val timestamp = Instant.parse(SAMPLE_TIMESTAMP)
    val sampleAsset = AssetReadModel(
        id = 1,
        cid = "A4AI-GCS",
        uuid = "DRN-01",
        companyId = 1,
        type = "drone",
        name = "DRN-01",
        description = "M7 PoC telemetry-linked unmanned asset",
        imageUrl = null,
        status = "active",
        createdAt = timestamp,
        updatedAt = timestamp,
        groupId = group,
    )
    val telemetry = listOf(
        TelemetryReadModel(
            uuid = SAMPLE_GATEWAY_ID,
            latitude = 35.8714,
            longitude = 128.6014,
            altitude = 120.0,
            magneticX = 12.4,
            magneticY = -3.2,
            magneticZ = 42.1,
            soc = "78",
            phoneBatterySOC = 91.0,
            velocity = 8.5,
            totalDistance = 1520.0,
            epochTime = "00:10:23",
            portDistance = 250.0,
            groupId = group,
        ),
    )
    return OperationalReadSeeds(
        telemetry = telemetry,
        assetsByGateway = mapOf(SAMPLE_GATEWAY_ID to listOf(sampleAsset)),
    )
}

private const val SAMPLE_GATEWAY_ID = "raw.sample.front"
private const val SAMPLE_GROUP_ID = "co-a"
private const val SAMPLE_TIMESTAMP = "2026-06-01T00:00:00Z"
