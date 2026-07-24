package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.protocol.v2.TelemetryEnvelopePayload

class MqttTelemetryConsumerBridge(
    private val repository: OperationalReadRepository,
    private val geofenceEvaluator: GeofenceTelemetryEvaluator = GeofenceTelemetryEvaluator.NOOP,
) {
    fun handle(topic: String, payload: ByteArray): TelemetryReadModel? {
        val message = MqttAssetTopic.parse(topic)
        if (message.channel != MqttTopicSegments.TELEMETRY) {
            return null
        }
        val telemetry = TelemetryEnvelopePayload.fromWire(payload)
        require(telemetry.orgId == message.orgId && telemetry.groupId == message.groupId && telemetry.assetId == message.assetId) {
            "telemetry envelope does not match MQTT topic identity"
        }
        return repository.upsertTelemetry(telemetry.toReadModel()).also { geofenceEvaluator.evaluate(it) }
    }
}

data class MqttAssetTopic(
    val orgId: String,
    val groupId: String,
    val assetId: String,
    val channel: String,
) {
    companion object {
        fun parse(topic: String): MqttAssetTopic {
            val parts = topic.split("/")
            require(parts.size == 5 && parts[0] == MqttTopicSegments.ROOT) {
                "invalid GCS-Saker MQTT topic"
            }
            return MqttAssetTopic(
                orgId = parts[1],
                groupId = parts[2],
                assetId = parts[3],
                channel = parts[4],
            )
        }
    }
}

object MqttTopicSegments {
    const val ROOT = "gcs"
    const val TELEMETRY = "telemetry"
}
