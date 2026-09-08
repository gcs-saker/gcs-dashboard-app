package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuditAnchorWriter
import kr.co.a4ai.gcssaker.authpolicy.domain.AuditChainHeadReader
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import java.time.Instant

class AuditAnchorPublisher(
    private val reader: AuditChainHeadReader,
    private val writer: AuditAnchorWriter,
    private val now: () -> Instant = Instant::now,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${gcs.audit.anchor.interval-millis:300000}")
    fun publish() {
        try {
            val head = reader.current() ?: return
            val anchor = writer.append(head, now())
            logger.info(
                "audit_anchor result=written sequence={} record_count={} anchor_hash_prefix={}",
                anchor.sequence, anchor.recordCount, anchor.anchorHash.take(12),
            )
        } catch (error: RuntimeException) {
            logger.error("audit_anchor_failed error_code=audit_anchor_write_failed error_type={}", error.javaClass.simpleName)
        }
    }
}
