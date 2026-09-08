package kr.co.a4ai.gcssaker.authpolicy.infrastructure.time

import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class NtpPacketCodecTest {
    @Test
    fun `codec validates origin and decodes server timestamps`() {
        val request = NtpPacketCodec.request(Instant.parse("2026-09-08T00:00:00Z"))
        val response = request.copyOf().also {
            it[0] = 0x24
            it[1] = 2
            request.copyInto(it, 24, 40, 48)
            writeTimestamp(it, 32, Instant.parse("2026-09-08T00:00:00.100Z"))
            writeTimestamp(it, 40, Instant.parse("2026-09-08T00:00:00.110Z"))
        }

        val decoded = NtpPacketCodec.response(response, request)

        assertWithinNtpTick(Instant.parse("2026-09-08T00:00:00.100Z"), decoded.receive)
        assertWithinNtpTick(Instant.parse("2026-09-08T00:00:00.110Z"), decoded.transmit)
    }

    @Test
    fun `codec rejects unsynchronized or mismatched responses`() {
        val request = NtpPacketCodec.request(Instant.parse("2026-09-08T00:00:00Z"))
        val unsynchronized = ByteArray(48).also { it[0] = 0xE4.toByte(); it[1] = 2 }
        assertThrows(IllegalArgumentException::class.java) { NtpPacketCodec.response(unsynchronized, request) }

        val mismatch = request.copyOf().also { it[0] = 0x24; it[1] = 2 }
        assertThrows(IllegalArgumentException::class.java) { NtpPacketCodec.response(mismatch, request) }
    }

    private fun writeTimestamp(packet: ByteArray, offset: Int, instant: Instant) {
        writeUnsigned(packet, offset, instant.epochSecond + 2_208_988_800L)
        writeUnsigned(packet, offset + 4, (instant.nano.toLong() shl 32) / 1_000_000_000L)
    }

    private fun assertWithinNtpTick(expected: Instant, actual: Instant) {
        assertTrue(java.time.Duration.between(expected, actual).abs().toNanos() <= 1)
    }

    private fun writeUnsigned(packet: ByteArray, offset: Int, value: Long) {
        for (index in 0..3) packet[offset + index] = (value ushr (24 - index * 8)).toByte()
    }
}
