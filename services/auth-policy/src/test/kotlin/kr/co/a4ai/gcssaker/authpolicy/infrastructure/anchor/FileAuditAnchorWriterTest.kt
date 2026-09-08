package kr.co.a4ai.gcssaker.authpolicy.infrastructure.anchor

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHead
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

class FileAuditAnchorWriterTest {
    @TempDir
    lateinit var directory: Path

    private val mapper = jacksonObjectMapper().findAndRegisterModules()
    private val writer by lazy {
        FileAuditAnchorWriter(directory, "anchor-hmac-key-with-at-least-32-bytes".toByteArray(), "commit-a", mapper)
    }

    @Test
    fun `writer creates immutable sequential anchors and skips unchanged head`() {
        val first = writer.append(AuditChainHead("a".repeat(64), 1), Instant.parse("2026-09-08T00:00:00Z"))
        val unchanged = writer.append(AuditChainHead("a".repeat(64), 1), Instant.parse("2026-09-08T00:05:00Z"))
        val second = writer.append(AuditChainHead("b".repeat(64), 2), Instant.parse("2026-09-08T00:10:00Z"))

        assertEquals(first, unchanged)
        assertEquals(1, first.sequence)
        assertEquals(first.anchorHash, second.previousAnchorHash)
        assertEquals(2, Files.list(directory).use { it.count() })
    }

    @Test
    fun `writer rejects a tampered existing anchor before extending chain`() {
        writer.append(AuditChainHead("a".repeat(64), 1), Instant.parse("2026-09-08T00:00:00Z"))
        val firstPath = directory.resolve("anchor-00000000000000000001.json")
        Files.writeString(firstPath, Files.readString(firstPath).replace("commit-a", "commit-b"))

        assertThrows(IllegalArgumentException::class.java) {
            writer.append(AuditChainHead("b".repeat(64), 2), Instant.parse("2026-09-08T00:05:00Z"))
        }
        assertEquals(1, Files.list(directory).use { it.count() })
    }
}
