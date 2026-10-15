package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers(disabledWithoutDocker = true)
class GroupClosureBenchmarkPostgresTest {
    private val database by lazy { DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password) }
    private fun source() = database
    private val jdbc by lazy { JdbcTemplate(database).apply { queryTimeout = 30 } }
    private fun unit(id: String, parent: String? = null) = OrganizationUnit(GroupId(id), id, GroupType.PLATOON, parent?.let(::GroupId))

    @Test
    fun `thousand branch fixture compares legacy full rewrite with measured delta mutation`() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        val seeds = listOf(unit("root-a"), unit("root-b"), unit("mid-a", "root-a"), unit("mid-b", "root-b"),
            unit("move", "mid-a"), unit("leaf-1", "move"), unit("leaf-2", "move")) +
            (1..1000).map { unit("unrelated-$it", "mid-a") }
        val groups = JdbcOrganizationHierarchyRepository(source(), seeds)
        val closureRows = requireNotNull(jdbc.queryForObject("SELECT COUNT(*) FROM organization_group_closure", Int::class.java))
        jdbc.execute("CREATE TABLE closure_benchmark_mutations (operation VARCHAR NOT NULL)")
        jdbc.execute("""CREATE FUNCTION record_closure_benchmark() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN INSERT INTO closure_benchmark_mutations VALUES (TG_OP); RETURN NULL; END; ${'$'}${'$'}""")
        jdbc.execute("CREATE TRIGGER closure_benchmark AFTER INSERT OR UPDATE OR DELETE ON organization_group_closure FOR EACH ROW EXECUTE FUNCTION record_closure_benchmark()")
        val samples = arrayOf(mutableListOf<Double>(), mutableListOf<Double>())
        var parent = "mid-a"
        repeat(9) { iteration ->
            val order = if (iteration % 2 == 0) listOf(0, 1) else listOf(1, 0)
            for (variant in order) {
                parent = if (parent == "mid-a") "mid-b" else "mid-a"
                jdbc.update("DELETE FROM closure_benchmark_mutations")
                val started = System.nanoTime()
                if (variant == 0) legacyRepositoryMove(parent) else groups.update(unit("move", parent))
                samples[variant].add((System.nanoTime() - started) / 1_000_000.0)
                assertEquals(if (variant == 0) closureRows * 2 else 12,
                    jdbc.queryForObject("SELECT COUNT(*) FROM closure_benchmark_mutations", Int::class.java))
                assertEquals(closureRows, jdbc.queryForObject("SELECT COUNT(*) FROM organization_group_closure", Int::class.java))
                assertTrue(groups.current().isAncestor(GroupId(parent), GroupId("leaf-1")))
            }
        }
        for (variant in 0..1) {
            val sorted = samples[variant].sorted()
            println("group_closure_benchmark result=PASS variant=${if (variant == 0) "legacy" else "delta"} groups=${seeds.size} closure_rows=$closureRows row_mutations=${if (variant == 0) closureRows * 2 else 12} samples=9 p50_ms=${sorted[4]} p95_ms=${sorted[8]}")
        }
    }

    private fun legacyRepositoryMove(parent: String) {
        // Benchmark-only baseline from b05c82ed; remove when #920 qualification retires the comparison.
        val transactions = TransactionTemplate(DataSourceTransactionManager(source())).apply {
            isolationLevel = org.springframework.transaction.TransactionDefinition.ISOLATION_SERIALIZABLE
            timeout = 30
        }
        transactions.executeWithoutResult {
            jdbc.update("UPDATE organization_groups SET name = ?, type = ?, parent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                "move", GroupType.PLATOON.name, parent, "active", "move")
            val units = jdbc.query("SELECT id, name, type, parent_id, status FROM organization_groups ORDER BY id") { row, _ ->
                OrganizationUnit(GroupId(row.getString("id")), row.getString("name"), GroupType.valueOf(row.getString("type")),
                    row.getString("parent_id")?.let(::GroupId), GroupStatus.valueOf(row.getString("status").uppercase()))
            }.filter { group -> group.status == GroupStatus.ACTIVE }
            OrganizationHierarchy.of(units)
            val byId = units.associateBy { group -> group.id }
            jdbc.update("DELETE FROM organization_group_closure")
            for (descendant in units) {
                var ancestor: GroupId? = descendant.id
                var depth = 0
                while (ancestor != null) {
                    jdbc.update("INSERT INTO organization_group_closure VALUES (?, ?, ?)", ancestor.value, descendant.id.value, depth++)
                    ancestor = byId[ancestor]?.parentId
                }
            }
        }
    }

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
