package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Index
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(
    name = "operational_events",
    indexes = [
        Index(name = "ix_operational_events_group_occurred", columnList = "group_id, occurred_at"),
        Index(name = "ix_operational_events_group_severity_occurred", columnList = "group_id, severity, occurred_at"),
    ],
)
class JpaOperationalEventEntity(
    @Id
    @Column(name = "id", nullable = false, length = 128)
    var id: String = "",

    @Column(name = "occurred_at", nullable = false)
    var occurredAt: Instant = Instant.EPOCH,

    @Column(name = "severity", nullable = false, length = 32)
    var severity: String = "",

    @Column(name = "category", nullable = false, length = 64)
    var category: String = "",

    @Column(name = "source", nullable = false, length = 128)
    var source: String = "",

    @Column(name = "message", nullable = false, length = 1024)
    var message: String = "",

    @Column(name = "connections", nullable = false)
    var connections: Int = 0,

    @Column(name = "latency_ms", nullable = false)
    var latencyMs: Long = 0,

    @Column(name = "throughput_mbps", nullable = false)
    var throughputMbps: Double = 0.0,

    @Column(name = "group_id", nullable = false, length = 64)
    var groupId: String = "",
)
