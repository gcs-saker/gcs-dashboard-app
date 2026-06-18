package kr.co.a4ai.gcssaker.authpolicy.protocol.v2

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel

object TelemetryEnvelopeFields {
    const val EVENT_ID = 1
    const val ORG_ID = 2
    const val GROUP_ID = 3
    const val ASSET_ID = 4
    const val ASSET_KIND = 5
    const val OBSERVED_UNIX_MILLIS = 6
    const val RECEIVED_UNIX_MILLIS = 7
    const val LATITUDE = 8
    const val LONGITUDE = 9
    const val ALTITUDE_M = 10
    const val HEADING_DEG = 11
    const val SPEED_MPS = 12
    const val BATTERY_PERCENT = 13
    const val HEALTH = 14
    const val ACTIVE_STREAM_ID = 15
}

data class TelemetryEnvelopePayload(
    val eventId: String,
    val orgId: String,
    val groupId: String,
    val assetId: String,
    val assetKind: Long,
    val observedUnixMillis: Long,
    val receivedUnixMillis: Long,
    val latitude: Double,
    val longitude: Double,
    val altitudeM: Double,
    val headingDeg: Double,
    val speedMps: Double,
    val batteryPercent: Double,
    val health: Long,
    val activeStreamIds: List<String>,
) {
    fun toReadModel(): TelemetryReadModel =
        TelemetryReadModel(
            uuid = assetId,
            latitude = latitude,
            longitude = longitude,
            altitude = altitudeM,
            magneticX = headingDeg,
            magneticY = 0.0,
            magneticZ = 0.0,
            soc = "0",
            phoneBatterySOC = batteryPercent,
            velocity = speedMps,
            totalDistance = 0.0,
            epochTime = legacyEpochTime(observedUnixMillis),
            portDistance = 0.0,
            groupId = GroupId(groupId),
        )

    companion object {
        fun fromWire(payload: ByteArray): TelemetryEnvelopePayload {
            val decoded = ProtobufWireDecoder.decode(payload)
            return TelemetryEnvelopePayload(
                eventId = decoded.singleString(TelemetryEnvelopeFields.EVENT_ID),
                orgId = decoded.singleString(TelemetryEnvelopeFields.ORG_ID),
                groupId = decoded.singleString(TelemetryEnvelopeFields.GROUP_ID),
                assetId = decoded.singleString(TelemetryEnvelopeFields.ASSET_ID),
                assetKind = decoded.singleLong(TelemetryEnvelopeFields.ASSET_KIND),
                observedUnixMillis = decoded.singleLong(TelemetryEnvelopeFields.OBSERVED_UNIX_MILLIS),
                receivedUnixMillis = decoded.singleLong(TelemetryEnvelopeFields.RECEIVED_UNIX_MILLIS),
                latitude = decoded.singleDouble(TelemetryEnvelopeFields.LATITUDE),
                longitude = decoded.singleDouble(TelemetryEnvelopeFields.LONGITUDE),
                altitudeM = decoded.singleDouble(TelemetryEnvelopeFields.ALTITUDE_M),
                headingDeg = decoded.singleDouble(TelemetryEnvelopeFields.HEADING_DEG),
                speedMps = decoded.singleDouble(TelemetryEnvelopeFields.SPEED_MPS),
                batteryPercent = decoded.singleDouble(TelemetryEnvelopeFields.BATTERY_PERCENT),
                health = decoded.singleLong(TelemetryEnvelopeFields.HEALTH),
                activeStreamIds = decoded.strings(TelemetryEnvelopeFields.ACTIVE_STREAM_ID),
            )
        }

        private fun legacyEpochTime(unixMillis: Long): String {
            val seconds = (unixMillis / 1000) % 86_400
            val hours = seconds / 3600
            val minutes = (seconds % 3600) / 60
            val remainingSeconds = seconds % 60
            return "%02d:%02d:%02d".format(hours, minutes, remainingSeconds)
        }
    }
}
