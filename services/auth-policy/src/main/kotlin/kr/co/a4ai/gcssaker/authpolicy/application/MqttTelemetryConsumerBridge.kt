package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceTelemetryEvaluator
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryAlertRuleEngine
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPublisher
import kr.co.a4ai.gcssaker.authpolicy.protocol.v2.TelemetryEnvelopePayload
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId

class MqttTelemetryConsumerBridge(
    private val repository: OperationalReadRepository,
    private val effects: TelemetryIngestionEffects = TelemetryIngestionEffects(
        GeofenceTelemetryEvaluator.NOOP, TelemetryAlertRuleEngine.NOOP, TelemetryPublisher.NOOP,
    ),
    private val identityResolver: MqttIdentityResolver = MqttIdentityResolver { error("authenticated MQTT identity required") },
) {
    fun handle(topic: String, payload: ByteArray): TelemetryReadModel? {
        val message = MqttAssetTopic.parse(topic)
        if (message.channel != MqttTopicSegments.TELEMETRY) {
            return null
        }
        val identity = identityResolver.resolve(topic)
        val telemetry = TelemetryEnvelopePayload.fromWire(payload)
        require(telemetry.orgId == message.orgId && telemetry.groupId == message.groupId && telemetry.assetId == message.assetId) {
            "telemetry envelope does not match MQTT topic identity"
        }
        require(identity.assetId == telemetry.assetId && identity.groupId.value == telemetry.groupId) {
            "authenticated MQTT identity mismatch"
        }
        return repository.upsertTelemetry(telemetry.toReadModel().copy(groupId = identity.groupId)).also {
            effects.geofence.evaluate(it)
            effects.alerts.evaluate(it)
            effects.publisher.publish(it)
        }
    }
}

fun interface MqttIdentityResolver { fun resolve(topic: String): MqttAuthenticatedIdentity }
data class MqttAuthenticatedIdentity(val assetId: String, val groupId: GroupId)

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
