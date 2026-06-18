package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JpaOperationalEventEntity
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JpaOperationalEventRepository
import org.hibernate.SessionFactory
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.data.domain.PageRequest
import java.time.Instant
import jakarta.persistence.EntityManagerFactory

@DataJpaTest(properties = ["spring.jpa.properties.hibernate.generate_statistics=true"])
class JpaOperationalEventRepositoryTest @Autowired constructor(
    private val repository: JpaOperationalEventRepository,
    private val entityManagerFactory: EntityManagerFactory,
) {
    @Test
    fun `jpa operational event query uses projection sized keyset page without offset`() {
        repository.saveAll(
            listOf(
                event("evt-003", "co-a", "2026-06-01T00:03:00Z"),
                event("evt-002", "co-a", "2026-06-01T00:02:00Z"),
                event("evt-001", "co-a", "2026-06-01T00:01:00Z"),
                event("evt-b", "co-b", "2026-06-01T00:04:00Z"),
            ),
        )

        val firstPage = repository.findEventPage(
            groupId = "co-a",
            admin = false,
            severity = null,
            fromTime = null,
            toTime = null,
            query = null,
            afterTime = null,
            afterId = null,
            pageable = PageRequest.of(0, 2),
        )
        val secondPage = repository.findEventPage(
            groupId = "co-a",
            admin = false,
            severity = null,
            fromTime = null,
            toTime = null,
            query = null,
            afterTime = firstPage.last().occurredAt,
            afterId = firstPage.last().id,
            pageable = PageRequest.of(0, 2),
        )

        assertEquals(listOf("evt-003", "evt-002"), firstPage.map { it.id })
        assertEquals(listOf("evt-001"), secondPage.map { it.id })
    }

    @Test
    fun `jpa operational event keyset page keeps a single select statement`() {
        repository.saveAll(
            listOf(
                event("evt-003", "co-a", "2026-06-01T00:03:00Z"),
                event("evt-002", "co-a", "2026-06-01T00:02:00Z"),
                event("evt-001", "co-a", "2026-06-01T00:01:00Z"),
            ),
        )
        repository.flush()
        val statistics = entityManagerFactory.unwrap(SessionFactory::class.java).statistics
        statistics.clear()

        val page = repository.findEventPage(
            groupId = "co-a",
            admin = false,
            severity = null,
            fromTime = null,
            toTime = null,
            query = null,
            afterTime = null,
            afterId = null,
            pageable = PageRequest.of(0, 2),
        )

        assertEquals(listOf("evt-003", "evt-002"), page.map { it.id })
        assertEquals(1, statistics.prepareStatementCount)
    }

    private fun event(id: String, groupId: String, occurredAt: String): JpaOperationalEventEntity =
        JpaOperationalEventEntity(
            id = id,
            occurredAt = Instant.parse(occurredAt),
            severity = "info",
            category = "api",
            source = "API 서버",
            message = "헬스체크 정상",
            connections = 1,
            latencyMs = 42,
            throughputMbps = 1.2,
            groupId = groupId,
        )
}
