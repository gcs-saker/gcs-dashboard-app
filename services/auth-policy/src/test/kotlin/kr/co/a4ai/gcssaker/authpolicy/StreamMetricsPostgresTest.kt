package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.Instant

@Testcontainers(disabledWithoutDocker = true)
class StreamMetricsPostgresTest {
    private val start = Instant.parse("2026-10-15T00:00:00Z")
    private fun source() = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private fun principal(role: UserRole = UserRole.VIEWER, group: String = "co-a") = AuthenticatedPrincipal("fixture", role, GroupId(group))
    private fun event(id: String, group: String, second: Long, path: String?) = OperationalEventReadModel(
        id, start.plusSeconds(second), "info", "network", source = "fixture", message = "synthetic", connections = 1,
        latencyMs = 10, throughputMbps = 23.5, groupId = GroupId(group), streamId = "stream", connectionId = null,
        icePath = path, relayFallbackReason = path,
    )
    private lateinit var repository: JdbcOperationalEventRepository

    @BeforeEach
    fun initialize() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        JdbcOrganizationHierarchyRepository(source(), listOf(
            OrganizationUnit(GroupId("bn-a"), "Parent", GroupType.BATTALION),
            OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY, GroupId("bn-a")),
            OrganizationUnit(GroupId("co-child"), "Child", GroupType.COMPANY, GroupId("bn-a")),
            OrganizationUnit(GroupId("co-b"), "Sibling", GroupType.COMPANY),
        ))
        repository = JdbcOperationalEventRepository(source(), listOf(
            event("a", "co-a", 0, "relay"), event("y", "co-a", 1, "relay"), event("z", "co-a", 1, null),
            event("child", "co-child", 2, "host"), event("sibling", "co-b", 3, "srflx"),
        ))
    }

    @Test
    fun `latest row preserves null fields timestamp ties and null connection identity`() {
        val result = repository.metricsFor(principal(), OperationalEventQuery()).streamSessions.single()
        assertEquals(3, result.eventCount)
        assertEquals(start.plusSeconds(1), result.lastOccurredAt)
        assertNull(result.icePath)
        assertNull(result.relayFallbackReason)
        assertNull(result.connectionId)
        assertEquals(10.0, result.averageLatencyMs)
    }

    @Test
    fun `latest row is chosen within the requested time and text filters`() {
        val filtered = repository.metricsFor(principal(), OperationalEventQuery(to = start, query = "synthetic")).streamSessions.single()
        assertEquals(1, filtered.eventCount)
        assertEquals("relay", filtered.icePath)
        assertTrue(repository.metricsFor(principal(), OperationalEventQuery(query = "missing")).streamSessions.isEmpty())
    }

    @Test
    fun `ancestor visibility and sibling denial remain identical`() {
        val parent = repository.metricsFor(principal(UserRole.GROUP_ADMIN, "bn-a"), OperationalEventQuery()).streamSessions.single()
        assertEquals(4, parent.eventCount)
        assertEquals("host", parent.icePath)
        val sibling = repository.metricsFor(principal(group = "co-b"), OperationalEventQuery()).streamSessions.single()
        assertEquals(1, sibling.eventCount)
        assertEquals("srflx", sibling.icePath)
    }

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
