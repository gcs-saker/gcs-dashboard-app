package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class GroupClosurePostgresTest {
    private fun source() = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private val jdbc get() = JdbcTemplate(source()).apply { queryTimeout = 3 }
    private lateinit var groups: JdbcOrganizationHierarchyRepository
    private fun unit(id: String, parent: String? = null) = OrganizationUnit(GroupId(id), id, GroupType.PLATOON, parent?.let(::GroupId))
    private fun seeds() = listOf(unit("root-a"), unit("root-b"), unit("mid-a", "root-a"), unit("mid-b", "root-b"),
        unit("move", "mid-a"), unit("leaf", "move"), unit("other", "mid-a"))

    @BeforeEach
    fun initialize() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        jdbc.update("DELETE FROM telemetry_history")
        jdbc.update("DELETE FROM telemetry_latest")
        jdbc.update("DELETE FROM organization_group_closure")
        jdbc.update("DELETE FROM organization_groups")
        groups = JdbcOrganizationHierarchyRepository(source(), seeds())
        jdbc.execute("CREATE TABLE IF NOT EXISTS closure_mutations (operation VARCHAR NOT NULL)")
        jdbc.execute("""CREATE OR REPLACE FUNCTION record_closure_mutation() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN INSERT INTO closure_mutations VALUES (TG_OP); RETURN NULL; END; ${'$'}${'$'}""")
        jdbc.execute("DROP TRIGGER IF EXISTS closure_mutation ON organization_group_closure")
        jdbc.execute("CREATE TRIGGER closure_mutation AFTER INSERT OR UPDATE OR DELETE ON organization_group_closure FOR EACH ROW EXECUTE FUNCTION record_closure_mutation()")
        jdbc.update("DELETE FROM closure_mutations")
    }

    @Test
    fun `renaming and healthy startup write no closure rows while leaf insertion stays local`() {
        groups.update(unit("move", "mid-a").copy(name = "Renamed"))
        JdbcOrganizationHierarchyRepository(source(), emptyList())
        assertEquals(0, mutations())
        groups.create(unit("new", "mid-b"))
        assertEquals(3, mutations())
        assertCanonical()
    }

    @Test
    fun `subtree move changes only external ancestry and changes current read visibility atomically`() {
        val reads = JdbcOperationalReadRepository(source(), emptyList(), emptyMap())
        reads.upsertTelemetry(TelemetryReadModel("fixture", 35.0, 128.0, 0.0, 0.0, 0.0, 0.0, "50", 50.0, 0.0, 0.0, "0", 0.0, GroupId("leaf")))
        val parent = AuthenticatedPrincipal("parent", UserRole.GROUP_ADMIN, GroupId("mid-a"))
        val other = parent.copy(groupId = GroupId("mid-b"))
        assertEquals(1, reads.telemetryFor(parent).size)
        assertTrue(reads.telemetryFor(other).isEmpty())
        val untouched = jdbc.queryForList("SELECT ancestor_group_id, descendant_group_id, ctid::text FROM organization_group_closure WHERE descendant_group_id = 'other' ORDER BY ancestor_group_id")
        groups.update(unit("move", "mid-b"))
        assertEquals(8, mutations())
        assertTrue(reads.telemetryFor(parent).isEmpty())
        assertEquals(1, reads.telemetryFor(other).size)
        assertEquals(untouched, jdbc.queryForList("SELECT ancestor_group_id, descendant_group_id, ctid::text FROM organization_group_closure WHERE descendant_group_id = 'other' ORDER BY ancestor_group_id"))
        assertCanonical()
    }

    @Test
    fun `common ancestor depth is updated in place and activation edges track active state`() {
        groups.update(unit("move", "root-a"))
        assertEquals(4, mutations())
        assertEquals(1, jdbc.queryForObject("SELECT depth FROM organization_group_closure WHERE ancestor_group_id = 'root-a' AND descendant_group_id = 'move'", Int::class.java))
        groups.update(unit("leaf", "move").copy(status = GroupStatus.INACTIVE))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM organization_group_closure WHERE descendant_group_id = 'leaf'", Int::class.java))
        groups.update(unit("leaf", "move"))
        assertCanonical()
    }

    @Test
    fun `failed delta persistence rolls back both parent and every closure mutation`() {
        val before = actual()
        jdbc.execute("ALTER TABLE organization_group_closure ADD CONSTRAINT reject_test_move CHECK (NOT (ancestor_group_id = 'root-b' AND descendant_group_id = 'move'))")
        try {
            assertThrows<StateConflictError> { groups.update(unit("move", "mid-b")) }
            assertEquals("mid-a", groups.listAll().single { it.id.value == "move" }.parentId?.value)
            assertEquals(before, actual())
            assertEquals(0, mutations())
        } finally {
            jdbc.execute("ALTER TABLE organization_group_closure DROP CONSTRAINT reject_test_move")
        }
    }

    @Test
    fun `cycle unknown duplicate oversize and descendant management are denied without partial changes`() {
        val before = actual()
        assertThrows<InvalidContractError> { groups.update(unit("root-a", "leaf")) }
        assertThrows<ResourceNotFoundError> { groups.update(unit("missing")) }
        assertThrows<StateConflictError> { groups.create(unit("root-a")) }
        assertThrows<InvalidContractError> { groups.create(unit("x".repeat(65))) }
        val lifecycle = GroupLifecycleService(groups, InMemoryAuthUserRepository(emptyList()), InMemoryRegisteredDeviceRepository())
        assertThrows<PermissionDeniedError> {
            lifecycle.update(AuthenticatedPrincipal("parent", UserRole.GROUP_ADMIN, GroupId("mid-a")), GroupId("leaf"), UpdateGroupCommand(name = "Denied"))
        }
        assertEquals(before, actual())
        assertEquals(0, mutations())
    }

    @Test
    fun `startup reconciles missing extra and wrong-depth derived relations without rebuilding healthy rows`() {
        jdbc.update("DELETE FROM organization_group_closure WHERE ancestor_group_id = 'leaf' AND descendant_group_id = 'leaf'")
        jdbc.update("INSERT INTO organization_group_closure VALUES ('root-b', 'leaf', 1)")
        jdbc.update("UPDATE organization_group_closure SET depth = 99 WHERE ancestor_group_id = 'root-a' AND descendant_group_id = 'move'")
        jdbc.update("DELETE FROM closure_mutations")
        JdbcOrganizationHierarchyRepository(source(), emptyList())
        assertEquals(3, mutations())
        assertCanonical()
    }

    @Test
    fun `independent writers create disjoint leaves without lost ancestry`() {
        val writers = listOf(groups, JdbcOrganizationHierarchyRepository(source(), emptyList()))
        concurrently { index -> writers[index].create(unit("new-$index", if (index == 0) "mid-a" else "mid-b")); true }
            .also { assertEquals(listOf(true, true), it) }
        assertCanonical()
    }

    @Test
    fun `concurrent opposing parent moves cannot both commit a cycle`() {
        val writers = listOf(groups, JdbcOrganizationHierarchyRepository(source(), emptyList()))
        val results = concurrently { index ->
            try {
                writers[index].update(unit(if (index == 0) "root-a" else "root-b", if (index == 0) "root-b" else "root-a"))
                true
            } catch (_: InvalidContractError) { false }
        }
        assertEquals(1, results.count { it })
        assertCanonical()
    }

    @Test
    fun `owned hierarchy lock has bounded retries and releases cleanly after failure`() {
        val before = actual()
        source().connection.use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.queryTimeout = 3; it.execute("SELECT pg_advisory_xact_lock(hashtextextended('gcs.auth-policy.hierarchy.v1', 0))") }
            val started = System.nanoTime()
            assertEquals(GroupHierarchyErrorCode.CONTENDED, assertThrows<GroupHierarchyStorageError> { groups.update(unit("move", "mid-b")) }.errorCode)
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 4_000)
            connection.rollback()
        }
        assertEquals(before, actual())
        groups.update(unit("move", "mid-b"))
        assertCanonical()
    }

    private fun concurrently(work: (Int) -> Boolean): List<Boolean> {
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        try {
            val futures = (0..1).map { index -> executor.submit<Boolean> { assertTrue(start.await(5, TimeUnit.SECONDS)); work(index) } }
            start.countDown()
            return futures.map { it.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    private fun mutations() = jdbc.queryForObject("SELECT COUNT(*) FROM closure_mutations", Int::class.java)
    private fun actual() = jdbc.queryForList("SELECT ancestor_group_id, descendant_group_id, depth FROM organization_group_closure ORDER BY ancestor_group_id, descendant_group_id")
    private fun assertCanonical() {
        assertEquals(jdbc.queryForList("""WITH RECURSIVE expected(ancestor_group_id, descendant_group_id, depth) AS (
            SELECT id, id, 0 FROM organization_groups WHERE status = 'active'
            UNION ALL SELECT g.parent_id, e.descendant_group_id, e.depth + 1 FROM expected e
            JOIN organization_groups g ON g.id = e.ancestor_group_id WHERE g.parent_id IS NOT NULL AND g.status = 'active'
            ) SELECT * FROM expected ORDER BY ancestor_group_id, descendant_group_id"""), actual())
    }

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
