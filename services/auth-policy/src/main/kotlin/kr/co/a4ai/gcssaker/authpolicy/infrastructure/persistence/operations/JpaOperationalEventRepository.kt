package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

interface JpaOperationalEventRepository : JpaRepository<JpaOperationalEventEntity, String> {
    @Query(
        """
        SELECT event
        FROM JpaOperationalEventEntity event
        WHERE (:admin = true OR event.groupId = :groupId)
          AND (:severity IS NULL OR event.severity = :severity)
          AND (:fromTime IS NULL OR event.occurredAt >= :fromTime)
          AND (:toTime IS NULL OR event.occurredAt <= :toTime)
          AND (:query IS NULL OR (
              LOWER(event.source) LIKE :query
              OR LOWER(event.message) LIKE :query
              OR LOWER(event.category) LIKE :query
              OR LOWER(COALESCE(event.eventType, '')) LIKE :query
              OR LOWER(COALESCE(event.sourceService, '')) LIKE :query
              OR LOWER(COALESCE(event.streamId, '')) LIKE :query
              OR LOWER(COALESCE(event.connectionId, '')) LIKE :query
              OR LOWER(COALESCE(event.icePath, '')) LIKE :query
              OR LOWER(COALESCE(event.relayFallbackReason, '')) LIKE :query
          ))
          AND (:afterTime IS NULL OR (
              event.occurredAt < :afterTime
              OR (event.occurredAt = :afterTime AND event.id < :afterId)
          ))
        ORDER BY event.occurredAt DESC, event.id DESC
        """,
    )
    fun findEventPage(
        @Param("groupId") groupId: String,
        @Param("admin") admin: Boolean,
        @Param("severity") severity: String?,
        @Param("fromTime") fromTime: Instant?,
        @Param("toTime") toTime: Instant?,
        @Param("query") query: String?,
        @Param("afterTime") afterTime: Instant?,
        @Param("afterId") afterId: String?,
        pageable: Pageable,
    ): List<JpaOperationalEventEntity>
}
