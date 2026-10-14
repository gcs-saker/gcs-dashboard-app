package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import javax.sql.DataSource
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import java.util.concurrent.TimeUnit
import java.time.temporal.ChronoUnit

class JdbcOperationalEventWriter(
    dataSource: DataSource,
    private val registry: MeterRegistry? = null,
) {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = AuditAppendTransactions.TRANSACTION_TIMEOUT_SECONDS }
    private val transactions = AuditAppendTransactions(dataSource, jdbc, registry)
    private val isPostgres = dataSource.connection.use { it.metaData.databaseProductName == "PostgreSQL" }
    private val logger = LoggerFactory.getLogger(javaClass)
    fun seed(initialEvents: Collection<OperationalEventReadModel>) {
        initialEvents.forEach(::appendIfAbsent)
    }

    fun appendIfAbsent(event: OperationalEventReadModel) {
        val started = System.nanoTime()
        try {
            val outcome = transactions.execute { appendOwned(event) }
            registry?.counter("gcs.auth_policy.audit.append", "result", outcome.name.lowercase())?.increment()
        } catch (error: AuditAppendError) {
            registry?.counter("gcs.auth_policy.audit.append", "result", "failed")?.increment()
            logger.warn(
                "audit_append operation=append result=failed duration_ms={} error_code={}",
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started), error.errorCode.value,
            )
            throw error
        } finally {
            registry?.timer("gcs.auth_policy.audit.append.duration")?.record(System.nanoTime() - started, TimeUnit.NANOSECONDS)
        }
    }

    private fun appendOwned(event: OperationalEventReadModel): AuditAppendOutcome {
        // The singleton row is the cross-process serialization point; JVM monitors are insufficient.
        val previousHash = jdbc.queryForObject(
            OperationalEventSql.lockAuditHead, String::class.java,
        ) ?: throw AuditAppendError(AuditAppendErrorCode.HEAD_MISSING)
        if (existsById(event.id)) return AuditAppendOutcome.DUPLICATE
        val persisted = normalizeStoragePrecision(event)
        val appended = if (AuditHashChain.isAudit(persisted)) AuditHashChain.chain(persisted, previousHash) else persisted
        if (insert(appended) == 0) return AuditAppendOutcome.DUPLICATE
        if (AuditHashChain.isAudit(event)) {
            val advanced = jdbc.update(
                OperationalEventSql.advanceAuditHead,
                appended.eventHash,
            )
            if (advanced != 1) throw AuditAppendError(AuditAppendErrorCode.HEAD_MISSING)
        }
        return AuditAppendOutcome.APPENDED
    }

    private fun normalizeStoragePrecision(event: OperationalEventReadModel): OperationalEventReadModel = event.copy(
        severity = event.severity.lowercase(),
        occurredAt = event.occurredAt.truncatedTo(ChronoUnit.MILLIS),
        receivedAt = event.receivedAt?.truncatedTo(ChronoUnit.MICROS),
        clockMeasuredAt = event.clockMeasuredAt?.truncatedTo(ChronoUnit.MICROS),
    )

    private fun insert(event: OperationalEventReadModel): Int =
        jdbc.update(
            if (isPostgres) OperationalEventSql.insertPostgres else OperationalEventSql.insert,
            event.id,
            Timestamp.from(event.occurredAt),
            event.severity.lowercase(),
            event.category,
            event.eventType,
            event.sourceService,
            event.source,
            event.message,
            event.connections,
            event.latencyMs,
            event.throughputMbps,
            event.groupId.value,
            event.streamId,
            event.connectionId,
            event.icePath,
            event.relayFallbackReason,
            event.traceId,
            event.actorId,
            event.operation,
            event.result,
            event.errorCode,
            event.clockStatus,
            event.previousHash,
            event.eventHash,
            event.receivedAt?.let(Timestamp::from),
            event.timeSource,
            event.clockDriftMs,
            event.clockMeasuredAt?.let(Timestamp::from),
        )

    private fun existsById(id: String): Boolean =
        (jdbc.queryForObject(OperationalEventSql.existsById, Int::class.java, id) ?: 0) > 0
}
