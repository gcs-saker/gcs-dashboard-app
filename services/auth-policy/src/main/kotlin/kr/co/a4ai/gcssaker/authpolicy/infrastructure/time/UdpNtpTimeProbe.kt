package kr.co.a4ai.gcssaker.authpolicy.infrastructure.time

import kr.co.a4ai.gcssaker.authpolicy.domain.NtpMeasurement
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpTimeProbe
import kr.co.a4ai.gcssaker.authpolicy.domain.NtpProbeError
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.time.Duration
import java.time.Instant

class UdpNtpTimeProbe : NtpTimeProbe {
    override fun measure(host: String, port: Int, timeout: Duration): NtpMeasurement {
        try {
            return measureNtp(host, port, timeout)
        } catch (error: IOException) {
            throw NtpProbeError("NTP network request failed", error)
        } catch (error: IllegalArgumentException) {
            throw NtpProbeError("NTP response validation failed", error)
        }
    }

    private fun measureNtp(host: String, port: Int, timeout: Duration): NtpMeasurement {
        val address = InetSocketAddress(host, port)
        val requestBytes = NtpPacketCodec.request(Instant.now())
        val responseBytes = ByteArray(NtpPacketCodec.PACKET_SIZE)
        val startedAt = Instant.now()
        DatagramSocket().use { socket ->
            socket.soTimeout = timeout.toMillis().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            socket.connect(address)
            socket.send(DatagramPacket(requestBytes, requestBytes.size))
            val response = DatagramPacket(responseBytes, responseBytes.size)
            socket.receive(response)
            require(response.length >= NtpPacketCodec.PACKET_SIZE) { "short NTP response" }
        }
        val completedAt = Instant.now()
        val timestamps = NtpPacketCodec.response(responseBytes, requestBytes)
        val offset = Duration.between(startedAt, timestamps.receive)
            .plus(Duration.between(completedAt, timestamps.transmit)).dividedBy(2)
        return NtpMeasurement("$host:$port", offset, completedAt, authenticated = false)
    }
}

internal data class NtpResponseTimes(val receive: Instant, val transmit: Instant)

internal object NtpPacketCodec {
    const val PACKET_SIZE = 48
    private const val NTP_EPOCH_SECONDS = 2_208_988_800L

    fun request(now: Instant): ByteArray = ByteArray(PACKET_SIZE).also { packet ->
        packet[0] = 0x23
        writeTimestamp(packet, 40, now)
    }

    fun response(packet: ByteArray, request: ByteArray): NtpResponseTimes {
        require(packet.size >= PACKET_SIZE) { "short NTP packet" }
        val leap = (packet[0].toInt() ushr 6) and 0x3
        val mode = packet[0].toInt() and 0x7
        val stratum = packet[1].toInt() and 0xff
        require(leap != 3 && mode == 4 && stratum in 1..15) { "untrusted NTP response" }
        require(packet.sliceArray(24..31).contentEquals(request.sliceArray(40..47))) { "NTP origin mismatch" }
        return NtpResponseTimes(readTimestamp(packet, 32), readTimestamp(packet, 40))
    }

    private fun readTimestamp(packet: ByteArray, offset: Int): Instant {
        val seconds = readUnsigned(packet, offset) - NTP_EPOCH_SECONDS
        val fraction = readUnsigned(packet, offset + 4)
        val nanos = ((fraction * 1_000_000_000L) ushr 32)
        return Instant.ofEpochSecond(seconds, nanos)
    }

    private fun writeTimestamp(packet: ByteArray, offset: Int, instant: Instant) {
        writeUnsigned(packet, offset, instant.epochSecond + NTP_EPOCH_SECONDS)
        writeUnsigned(packet, offset + 4, (instant.nano.toLong() shl 32) / 1_000_000_000L)
    }

    private fun readUnsigned(packet: ByteArray, offset: Int): Long = (0..3).fold(0L) { value, index ->
        (value shl 8) or (packet[offset + index].toLong() and 0xff)
    }

    private fun writeUnsigned(packet: ByteArray, offset: Int, value: Long) {
        for (index in 0..3) packet[offset + index] = (value ushr (24 - index * 8)).toByte()
    }
}
