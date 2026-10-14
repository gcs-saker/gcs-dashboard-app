package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOperationalReadRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.jdbc.datasource.DriverManagerDataSource
import java.time.Instant

class StreamSessionLatestContractTest {
    @Test
    fun `memory and jdbc latest views choose one session per group and stream`() {
        listOf<OperationalReadRepository>(
            InMemoryOperationalReadRepository(emptyList(), emptyMap()),
            JdbcOperationalReadRepository(DriverManagerDataSource().apply {
                setDriverClassName("org.h2.Driver")
                url = "jdbc:h2:mem:latest_contract;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"
                username = "sa"
                password = ""
            }, emptyList(), emptyMap()),
        ).forEach(::verifyLatestContract)
    }

    private fun verifyLatestContract(repository: OperationalReadRepository) {
        val observedAt = Instant.parse("2026-10-14T00:00:00Z")
        val first = StreamSessionReadModel(
            "test-stream", "old-session", "online", "test", observedAt, observedAt, null, GroupId("co-a"),
        )
        repository.recordStreamSession(first)
        repository.recordStreamSession(first.copy(sessionId = "new-session", lastHeartbeatAt = observedAt.plusSeconds(1)))
        repository.recordStreamSession(first.copy(sessionId = "stale-session", status = "offline"))
        repository.recordStreamSession(first.copy(groupId = GroupId("co-b"), sessionId = "sibling-session"))

        val own = AuthenticatedPrincipal("test-viewer", UserRole.VIEWER, GroupId("co-a"))
        assertEquals(listOf("new-session"), repository.streamSessionsFor(own).map { it.sessionId })
        val all = own.copy(role = UserRole.ADMIN)
        assertEquals(setOf("new-session", "sibling-session"), repository.streamSessionsFor(all).map { it.sessionId }.toSet())
    }
}
