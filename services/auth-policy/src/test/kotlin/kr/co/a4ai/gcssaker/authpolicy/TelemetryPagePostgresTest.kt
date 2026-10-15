package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class TelemetryPagePostgresTest {
    private fun source() = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private lateinit var repository: JdbcOperationalReadRepository
    private val viewer = AuthenticatedPrincipal("viewer", UserRole.VIEWER, GroupId("co-a"))

    @BeforeEach
    fun initialize() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        JdbcOrganizationHierarchyRepository(source(), listOf(
            OrganizationUnit(GroupId("bn-a"), "Parent", GroupType.BATTALION),
            OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY, GroupId("bn-a")),
            OrganizationUnit(GroupId("co-child"), "Child", GroupType.COMPANY, GroupId("bn-a")),
            OrganizationUnit(GroupId("co-b"), "B", GroupType.COMPANY),
        ))
        JdbcTemplate(source()).update("DELETE FROM telemetry_history")
        JdbcTemplate(source()).update("DELETE FROM telemetry_latest")
        repository = JdbcOperationalReadRepository(source(), emptyList(), emptyMap())
    }

    @Test
    fun `all stable identities appear exactly once without offset and legacy reads agree`() {
        listOf("a", "b", "c", "d", "e").forEach { repository.upsertTelemetry(sample(it)) }
        repository.upsertTelemetry(sample("sibling", "co-b"))
        val identities = mutableListOf<String>()
        var after: String? = null
        repeat(4) {
            val fetched = repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(2), after))
            val page = fetched.take(2)
            identities.addAll(page.map { it.uuid })
            if (page.isNotEmpty()) after = page.last().uuid
        }
        assertEquals(listOf("a", "b", "c", "d", "e"), identities)
        assertEquals(identities, repository.telemetryFor(viewer).map { it.uuid })
        assertEquals(identities.distinct(), identities)
    }

    @Test
    fun `lookahead is bounded to 501 and the one item page fetches only two`() {
        val jdbc = JdbcTemplate(source())
        jdbc.update("""INSERT INTO telemetry_latest (uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id)
            SELECT 'cap-' || LPAD(i::text, 4, '0'), 35, 128, 0, 0, 0, 0, '50', 50, 0, 0, '0', 0, 'co-a'
            FROM generate_series(1, 550) AS i""")
        assertEquals(501, repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(500))).size)
        assertEquals(2, repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(1))).size)
        assertTrue(repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(1), "z")).isEmpty())
    }

    @Test
    fun `same ancestor and sibling read scopes are rechecked on every page`() {
        repository.upsertTelemetry(sample("a"))
        repository.upsertTelemetry(sample("child", "co-child"))
        repository.upsertTelemetry(sample("sibling", "co-b"))
        val query = TelemetryPageQuery(TelemetryPageSize(10))
        assertEquals(listOf("a"), repository.telemetryPageFor(viewer, query).map { it.uuid })
        val parent = viewer.copy(role = UserRole.GROUP_ADMIN, groupId = GroupId("bn-a"))
        assertEquals(listOf("a", "child"), repository.telemetryPageFor(parent, query).map { it.uuid })
        assertEquals(listOf("sibling"), repository.telemetryPageFor(viewer.copy(groupId = GroupId("co-b")), query).map { it.uuid })
        assertEquals(3, repository.telemetryPageFor(viewer.copy(role = UserRole.ADMIN), query).size)
    }

    @Test
    fun `live value changes and newly earlier identities do not shift the seek position`() {
        listOf("a", "b", "c", "d").forEach { repository.upsertTelemetry(sample(it)) }
        val first = repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(2))).take(2)
        repository.upsertTelemetry(sample("a").copy(latitude = 36.0))
        repository.upsertTelemetry(sample("aa"))
        val next = repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(2), first.last().uuid))
        assertEquals(listOf("c", "d"), next.map { it.uuid })
        assertEquals(listOf("a", "aa"), repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(2))).take(2).map { it.uuid })
    }

    @Test
    fun `read lock wait times out without leaking SQL and recovers after release`() {
        repository.upsertTelemetry(sample("a"))
        source().connection.use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.queryTimeout = 3; it.execute("LOCK TABLE telemetry_latest IN ACCESS EXCLUSIVE MODE") }
            val started = System.nanoTime()
            val error = assertThrows<TelemetryPageUnavailableError> {
                repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(1)))
            }
            assertEquals("telemetry page is unavailable", error.message)
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 6_000)
            connection.rollback()
        }
        assertEquals(1, repository.telemetryPageFor(viewer, TelemetryPageQuery(TelemetryPageSize(1))).size)
    }

    private fun sample(uuid: String, group: String = "co-a") = TelemetryReadModel(
        uuid, 35.0, 128.0, 0.0, 0.0, 0.0, 0.0, "50", 50.0, 0.0, 0.0, "0", 0.0, GroupId(group),
    )

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
