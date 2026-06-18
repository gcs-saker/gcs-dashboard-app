package kr.co.a4ai.gcssaker.authpolicy.protocol.v2

import java.nio.ByteBuffer
import java.nio.ByteOrder

object ProtobufWireTypes {
    const val VARINT = 0
    const val FIXED64 = 1
    const val LENGTH_DELIMITED = 2
}

data class DecodedWireMessage(
    val fields: Map<Int, List<Any>>,
) {
    fun singleString(fieldNumber: Int): String =
        fields[fieldNumber]?.singleOrNull() as? String
            ?: throw IllegalArgumentException("field $fieldNumber must contain exactly one string")

    fun singleLong(fieldNumber: Int): Long =
        when (val value = fields[fieldNumber]?.singleOrNull()) {
            is Int -> value.toLong()
            is Long -> value
            else -> throw IllegalArgumentException("field $fieldNumber must contain exactly one integer")
        }

    fun singleDouble(fieldNumber: Int): Double =
        fields[fieldNumber]?.singleOrNull() as? Double
            ?: throw IllegalArgumentException("field $fieldNumber must contain exactly one double")

    fun strings(fieldNumber: Int): List<String> =
        fields[fieldNumber].orEmpty().filterIsInstance<String>()
}

object ProtobufWireDecoder {
    fun decode(payload: ByteArray): DecodedWireMessage {
        var cursor = 0
        val decoded = linkedMapOf<Int, MutableList<Any>>()
        while (cursor < payload.size) {
            val key = readVarint(payload, cursor)
            cursor = key.nextCursor
            val fieldNumber = key.value.toInt() shr 3
            val wireType = key.value.toInt() and 0b111
            val value: Any
            when (wireType) {
                ProtobufWireTypes.VARINT -> {
                    val result = readVarint(payload, cursor)
                    cursor = result.nextCursor
                    value = result.value
                }
                ProtobufWireTypes.FIXED64 -> {
                    require(cursor + 8 <= payload.size) { "fixed64 field exceeds payload size" }
                    value = ByteBuffer.wrap(payload, cursor, 8).order(ByteOrder.LITTLE_ENDIAN).double
                    cursor += 8
                }
                ProtobufWireTypes.LENGTH_DELIMITED -> {
                    val length = readVarint(payload, cursor)
                    cursor = length.nextCursor
                    val end = cursor + length.value.toInt()
                    require(end <= payload.size) { "length-delimited field exceeds payload size" }
                    value = payload.copyOfRange(cursor, end).toString(Charsets.UTF_8)
                    cursor = end
                }
                else -> throw IllegalArgumentException("unsupported wire type: $wireType")
            }
            decoded.getOrPut(fieldNumber) { mutableListOf() }.add(value)
        }
        return DecodedWireMessage(decoded)
    }

    private fun readVarint(payload: ByteArray, startCursor: Int): VarintResult {
        var cursor = startCursor
        var shift = 0
        var result = 0L
        while (cursor < payload.size) {
            val byte = payload[cursor].toInt() and 0xFF
            cursor += 1
            result = result or ((byte and 0x7F).toLong() shl shift)
            if ((byte and 0x80) == 0) {
                return VarintResult(result, cursor)
            }
            shift += 7
        }
        throw IllegalArgumentException("unterminated varint")
    }
}

private data class VarintResult(
    val value: Long,
    val nextCursor: Int,
)
