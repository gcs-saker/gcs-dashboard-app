package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.application.MqttTelemetryConsumerBridge
import kr.co.a4ai.gcssaker.authpolicy.application.MqttAssetTopic
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.protocol.v2.TelemetryEnvelopeFields
import kr.co.a4ai.gcssaker.authpolicy.protocol.v2.TelemetryEnvelopePayload
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.nio.ByteBuffer
import java.nio.ByteOrder

class MqttTelemetryConsumerBridgeTest {
    @Test
    fun `spring bridge decodes protobuf telemetry and upserts read model`() {
        val repository = InMemoryOperationalReadRepository(telemetry = emptyList(), assetsByGateway = emptyMap())
        val bridge = MqttTelemetryConsumerBridge(repository)
        val payload = telemetryPayload(assetId = "raw.mobile.front")

        val result = bridge.handle("gcs/a4ai/co-a/raw.mobile.front/telemetry", payload)
        val visible = repository.telemetryFor(principal("co-a"))

        requireNotNull(result)
        assertEquals("raw.mobile.front", result.uuid)
        assertEquals(35.871435, result.latitude)
        assertEquals(128.601445, result.longitude)
        assertEquals("16:00:00", result.epochTime)
        assertEquals(1, visible.size)
        assertEquals("raw.mobile.front", visible[0].uuid)
    }

    @Test
    fun `spring bridge ignores non telemetry mqtt channels`() {
        val repository = InMemoryOperationalReadRepository(telemetry = emptyList(), assetsByGateway = emptyMap())
        val bridge = MqttTelemetryConsumerBridge(repository)

        val result = bridge.handle("gcs/a4ai/co-a/raw.mobile.front/status", telemetryPayload())

        assertNull(result)
        assertTrue(repository.telemetryFor(principal("co-a")).isEmpty())
    }

    @Test
    fun `spring bridge rejects payload identity mismatch`() {
        val repository = InMemoryOperationalReadRepository(telemetry = emptyList(), assetsByGateway = emptyMap())
        val bridge = MqttTelemetryConsumerBridge(repository)

        val error = assertThrows<IllegalArgumentException> {
            bridge.handle("gcs/a4ai/co-a/raw.other/telemetry", telemetryPayload(assetId = "raw.mobile.front"))
        }

        assertEquals("telemetry envelope does not match MQTT topic identity", error.message)
    }

    @Test
    fun `spring mqtt topic parser rejects legacy topic`() {
        val error = assertThrows<IllegalArgumentException> {
            MqttAssetTopic.parse("robot/control/CID001")
        }

        assertEquals("invalid GCS-Saker MQTT topic", error.message)
    }

    @Test
    fun `telemetry envelope converts to read model without exposing protobuf DTO to dashboard`() {
        val telemetry = TelemetryEnvelopePayload.fromWire(telemetryPayload())
        val readModel = telemetry.toReadModel()

        assertEquals("raw.mobile.front", readModel.uuid)
        assertEquals(GroupId("co-a"), readModel.groupId)
        assertEquals(78.0, readModel.phoneBatterySOC)
    }

    private fun principal(groupId: String): AuthenticatedPrincipal =
        AuthenticatedPrincipal(
            username = "viewer",
            role = UserRole.VIEWER,
            groupId = GroupId(groupId),
        )

    private fun telemetryPayload(assetId: String = "raw.mobile.front"): ByteArray {
        val writer = ProtoWriter()
        writer.string(TelemetryEnvelopeFields.EVENT_ID, "evt-20260618-0001")
        writer.string(TelemetryEnvelopeFields.ORG_ID, "a4ai")
        writer.string(TelemetryEnvelopeFields.GROUP_ID, "co-a")
        writer.string(TelemetryEnvelopeFields.ASSET_ID, assetId)
        writer.varint(TelemetryEnvelopeFields.ASSET_KIND, 4)
        writer.varint(TelemetryEnvelopeFields.OBSERVED_UNIX_MILLIS, 1_781_712_000_000)
        writer.varint(TelemetryEnvelopeFields.RECEIVED_UNIX_MILLIS, 1_781_712_000_042)
        writer.double(TelemetryEnvelopeFields.LATITUDE, 35.871435)
        writer.double(TelemetryEnvelopeFields.LONGITUDE, 128.601445)
        writer.double(TelemetryEnvelopeFields.ALTITUDE_M, 84.5)
        writer.double(TelemetryEnvelopeFields.HEADING_DEG, 7.2)
        writer.double(TelemetryEnvelopeFields.SPEED_MPS, 3.5)
        writer.double(TelemetryEnvelopeFields.BATTERY_PERCENT, 78.0)
        writer.varint(TelemetryEnvelopeFields.HEALTH, 1)
        writer.string(TelemetryEnvelopeFields.ACTIVE_STREAM_ID, assetId)
        return writer.toByteArray()
    }
}

private class ProtoWriter {
    private val bytes = mutableListOf<Byte>()

    fun string(fieldNumber: Int, value: String) {
        val encoded = value.toByteArray(Charsets.UTF_8)
        writeVarint(((fieldNumber shl 3) or 2).toLong())
        writeVarint(encoded.size.toLong())
        encoded.forEach { bytes.add(it) }
    }

    fun varint(fieldNumber: Int, value: Long) {
        writeVarint((fieldNumber shl 3).toLong())
        writeVarint(value)
    }

    fun double(fieldNumber: Int, value: Double) {
        writeVarint(((fieldNumber shl 3) or 1).toLong())
        ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value).array().forEach { bytes.add(it) }
    }

    fun toByteArray(): ByteArray = bytes.toByteArray()

    private fun writeVarint(value: Long) {
        var remaining = value
        while (remaining > 0x7F) {
            bytes.add((((remaining and 0x7F) or 0x80).toInt()).toByte())
            remaining = remaining shr 7
        }
        bytes.add(remaining.toByte())
    }
}
