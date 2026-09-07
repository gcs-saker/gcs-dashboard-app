package kr.co.a4ai.gcssaker.authpolicy.infrastructure.anchor

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditAnchorRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditAnchorWriter
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHead
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class FileAuditAnchorWriter(
    private val directory: Path,
    private val hmacKey: ByteArray,
    private val sourceCommit: String,
    private val mapper: ObjectMapper,
) : AuditAnchorWriter {
    init {
        require(hmacKey.size >= 32) { "audit anchor HMAC key must contain at least 32 bytes" }
        Files.createDirectories(directory)
    }

    @Synchronized
    override fun append(head: AuditChainHead, anchoredAt: Instant): AuditAnchorRecord {
        val previous = latestAnchor()
        if (previous?.chainHead == head.eventHash && previous.recordCount == head.recordCount) return previous
        val sequence = (previous?.sequence ?: 0) + 1
        val previousHash = previous?.anchorHash ?: GENESIS_HASH
        val unsigned = canonical(AnchorPayload(sequence, previousHash, head, anchoredAt, sourceCommit.take(64)))
        val anchorHash = sha256(unsigned)
        val record = AuditAnchorRecord(
            sequence, previousHash, head.eventHash, head.recordCount, anchoredAt,
            sourceCommit.take(64), anchorHash, hmac(anchorHash),
        )
        writeOnce(record)
        return record
    }

    private fun latestAnchor(): AuditAnchorRecord? = Files.list(directory).use { paths ->
        paths.filter { it.fileName.toString().matches(FILE_PATTERN) }
            .max(Comparator.comparing(Path::toString)).orElse(null)
            ?.let { mapper.readValue<AuditAnchorRecord>(it.toFile()) }
            ?.also { require(validAnchor(it)) { "existing audit anchor failed integrity verification" } }
    }

    private fun validAnchor(record: AuditAnchorRecord): Boolean {
        val head = AuditChainHead(record.chainHead, record.recordCount)
        val expectedHash = sha256(canonical(AnchorPayload(
            record.sequence, record.previousAnchorHash, head, record.anchoredAt, record.sourceCommit,
        )))
        return MessageDigest.isEqual(expectedHash.toByteArray(), record.anchorHash.toByteArray()) &&
            MessageDigest.isEqual(hmac(record.anchorHash).toByteArray(), record.signature.toByteArray())
    }

    private fun writeOnce(record: AuditAnchorRecord) {
        val path = directory.resolve("anchor-%020d.json".format(record.sequence))
        val payload = mapper.writeValueAsBytes(record) + byteArrayOf('\n'.code.toByte())
        FileChannel.open(path, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE).use { channel ->
            channel.write(ByteBuffer.wrap(payload))
            channel.force(true)
        }
    }

    private fun canonical(payload: AnchorPayload): ByteArray =
        listOf(
            payload.sequence.toString(), payload.previousHash, payload.head.eventHash,
            payload.head.recordCount.toString(), payload.at.toString(), payload.commit,
        )
            .joinToString("|").toByteArray(StandardCharsets.UTF_8)

    private fun sha256(value: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(value).joinToString("") { "%02x".format(it) }

    private fun hmac(anchorHash: String): String = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(hmacKey, "HmacSHA256"))
        doFinal(anchorHash.toByteArray(StandardCharsets.US_ASCII)).joinToString("") { "%02x".format(it) }
    }

    private companion object {
        val FILE_PATTERN = Regex("^anchor-[0-9]{20}\\.json$")
        val GENESIS_HASH = "0".repeat(64)
    }
}

private data class AnchorPayload(
    val sequence: Long,
    val previousHash: String,
    val head: AuditChainHead,
    val at: Instant,
    val commit: String,
)
