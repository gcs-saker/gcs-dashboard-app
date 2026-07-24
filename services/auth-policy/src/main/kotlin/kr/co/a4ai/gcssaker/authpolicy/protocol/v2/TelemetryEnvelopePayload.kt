package kr.co.a4ai.gcssaker.authpolicy.protocol.v2

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel

object TelemetryEnvelopeFields {
    const val EVENT_ID = 1
    const val ORG_ID = 2
    const val GROUP_ID = 3
    const val ASSET_ID = 4
    const val ASSET_KIND = 5
    const val TIME = 6
    const val POSITION = 7
    const val HEADING_DEG = 8
    const val SPEED_MPS = 9
    const val BATTERY_PERCENT = 10
    const val HEALTH = 11
    const val ACTIVE_STREAM_ID = 12
    const val ATTITUDE_DEG = 13
    const val GYRO_RAD_PER_SEC = 14
    const val ACCEL_MPS2 = 15
    const val LINK_QUALITY_PERCENT = 16
}

object TimestampedFields {
    const val OBSERVED_UNIX_MILLIS = 1
    const val RECEIVED_UNIX_MILLIS = 2
}

object GeoPointFields {
    const val LATITUDE = 1
    const val LONGITUDE = 2
    const val ALTITUDE_M = 3
}

object Vector3Fields {
    const val X = 1
    const val Y = 2
    const val Z = 3
}

data class TelemetryVector3(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val z: Double = 0.0,
)

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
    val attitudeDeg: TelemetryVector3 = TelemetryVector3(),
    val gyroRadPerSec: TelemetryVector3 = TelemetryVector3(),
    val accelMps2: TelemetryVector3 = TelemetryVector3(),
    val linkQualityPercent: Double = 0.0,
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
            batteryPercent = batteryPercent,
            rollDeg = attitudeDeg.x,
            pitchDeg = attitudeDeg.y,
            yawDeg = attitudeDeg.z,
            linkQualityPercent = linkQualityPercent,
            observedAt = java.time.Instant.ofEpochMilli(observedUnixMillis),
        )

    companion object {
        fun fromWire(payload: ByteArray): TelemetryEnvelopePayload {
            val decoded = ProtobufWireDecoder.decode(payload)
            val time = decoded.singleMessage(TelemetryEnvelopeFields.TIME)
            val position = decoded.singleMessage(TelemetryEnvelopeFields.POSITION)
            return TelemetryEnvelopePayload(
                eventId = decoded.singleString(TelemetryEnvelopeFields.EVENT_ID),
                orgId = decoded.singleString(TelemetryEnvelopeFields.ORG_ID),
                groupId = decoded.singleString(TelemetryEnvelopeFields.GROUP_ID),
                assetId = decoded.singleString(TelemetryEnvelopeFields.ASSET_ID),
                assetKind = decoded.singleLong(TelemetryEnvelopeFields.ASSET_KIND),
                observedUnixMillis = time.singleLong(TimestampedFields.OBSERVED_UNIX_MILLIS),
                receivedUnixMillis = time.singleLong(TimestampedFields.RECEIVED_UNIX_MILLIS),
                latitude = position.singleDouble(GeoPointFields.LATITUDE),
                longitude = position.singleDouble(GeoPointFields.LONGITUDE),
                altitudeM = position.singleDouble(GeoPointFields.ALTITUDE_M),
                headingDeg = decoded.singleDouble(TelemetryEnvelopeFields.HEADING_DEG),
                speedMps = decoded.singleDouble(TelemetryEnvelopeFields.SPEED_MPS),
                batteryPercent = decoded.singleDouble(TelemetryEnvelopeFields.BATTERY_PERCENT),
                health = decoded.singleLong(TelemetryEnvelopeFields.HEALTH),
                activeStreamIds = decoded.strings(TelemetryEnvelopeFields.ACTIVE_STREAM_ID),
                attitudeDeg = decoded.optionalVector3(TelemetryEnvelopeFields.ATTITUDE_DEG),
                gyroRadPerSec = decoded.optionalVector3(TelemetryEnvelopeFields.GYRO_RAD_PER_SEC),
                accelMps2 = decoded.optionalVector3(TelemetryEnvelopeFields.ACCEL_MPS2),
                linkQualityPercent = decoded.optionalDouble(TelemetryEnvelopeFields.LINK_QUALITY_PERCENT),
            )
        }

        private fun DecodedWireMessage.optionalVector3(fieldNumber: Int): TelemetryVector3 {
            val vector = fields[fieldNumber]?.singleOrNull() as? ByteArray ?: return TelemetryVector3()
            val decoded = ProtobufWireDecoder.decode(vector)
            return TelemetryVector3(
                x = decoded.singleDouble(Vector3Fields.X),
                y = decoded.singleDouble(Vector3Fields.Y),
                z = decoded.singleDouble(Vector3Fields.Z),
            )
        }

        private fun DecodedWireMessage.optionalDouble(fieldNumber: Int): Double =
            fields[fieldNumber]?.singleOrNull() as? Double ?: 0.0

        private fun legacyEpochTime(unixMillis: Long): String {
            val seconds = (unixMillis / 1000) % 86_400
            val hours = seconds / 3600
            val minutes = (seconds % 3600) / 60
            val remainingSeconds = seconds % 60
            return "%02d:%02d:%02d".format(hours, minutes, remainingSeconds)
        }
    }
}
