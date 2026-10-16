package kr.co.a4ai.gcssaker.authpolicy

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TelemetryOwnGroupJdbcPostgresTest {
    private lateinit var fixture: TelemetryOwnGroupJdbcFixture
    private val query = TelemetryPageQuery(TelemetryPageSize(50), "device-00000000")

    @BeforeAll
    fun initialize() {
        fixture = TelemetryOwnGroupJdbcFixture(postgres)
        fixture.initialize()
    }

    @Test
    fun `real pgJDBC and pooled statements preserve rows and measure bounded own scope in every plan mode`() {
        for (mode in listOf("auto", "force_custom_plan", "force_generic_plan")) {
            fixture.pool(mode).use { pool ->
                val jdbc = JdbcTemplate(pool).apply { queryTimeout = 3 }
                val reader = JdbcTelemetryPageReader(pool)
                val driver = pool.connection.use { it.metaData.driverVersion }
                assertTrue(driver.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")))
                val actors = listOf(fixture.own("dense"), fixture.own("sparse", UserRole.OPERATOR), fixture.own("empty"))
                repeat(8) { for (actor in actors) assertEquals(fixture.legacy(jdbc, actor, query), reader.read(actor, query)) }
                for ((index, actor) in actors.withIndex()) {
                    val legacy = mutableListOf<Double>()
                    val bounded = mutableListOf<Double>()
                    repeat(9) { sample ->
                        val before = { timed { fixture.legacy(jdbc, actor, query) } }
                        val after = { timed { reader.read(actor, query) } }
                        if (sample % 2 == 0) { legacy.add(before()); bounded.add(after()) }
                        else { bounded.add(after()); legacy.add(before()) }
                    }
                    val profile = listOf("dense", "sparse", "empty")[index]
                    println("telemetry_own_jdbc result=PASS mode=$mode case=$profile pgjdbc=$driver rows=${fixture.rows + 1} samples=${legacy.size} legacy_p50_ms=${median(legacy)} bounded_p50_ms=${median(bounded)} legacy_p95_ms=${p95(legacy)} bounded_p95_ms=${p95(bounded)}")
                }
                val counts = preparedCounts(jdbc)
                assertTrue(counts.any { it[0] == 7L && it[1] + it[2] > 0 })
                assertTrue(counts.any { it[0] == 8L && it[1] + it[2] > 0 })
                if (mode == "force_generic_plan") assertTrue(counts.filter { it[0] in setOf(7L, 8L) }.all { it[1] > 0 && it[2] == 0L })
                if (mode == "force_custom_plan") assertTrue(counts.filter { it[0] in setOf(7L, 8L) }.all { it[2] > 0 && it[1] == 0L })
            }
        }
    }

    @Test
    fun `same physical pool switches group and role without carrying prior actor scope`() {
        fixture.pool("force_generic_plan").use { pool ->
            val jdbc = JdbcTemplate(pool).apply { queryTimeout = 3 }
            val reader = JdbcTelemetryPageReader(pool)
            val physicalSession = jdbc.queryForObject("SELECT pg_backend_pid()", Int::class.java)
            repeat(12) {
                for (actor in listOf(fixture.own("dense"), fixture.own("sparse", UserRole.OPERATOR), fixture.own("parent", UserRole.GROUP_ADMIN), fixture.own("outside"), fixture.own("dense", UserRole.ADMIN))) {
                    val rows = reader.read(actor, query)
                    assertEquals(fixture.legacy(jdbc, actor, query), rows)
                    if (actor.role in setOf(UserRole.VIEWER, UserRole.OPERATOR)) assertTrue(rows.all { it.groupId == actor.groupId })
                    if (actor.role == UserRole.GROUP_ADMIN) assertTrue(rows.none { it.groupId == GroupId("outside") })
                    assertEquals(physicalSession, jdbc.queryForObject("SELECT pg_backend_pid()", Int::class.java))
                }
            }
            val end = TelemetryPageQuery(TelemetryPageSize(1), "outside-")
            assertEquals(listOf("outside-fixture"), reader.read(fixture.own("dense", UserRole.ADMIN), end).map { it.uuid })
            assertTrue(reader.read(fixture.own("parent", UserRole.GROUP_ADMIN), end).isEmpty())
        }
    }

    @Test
    fun `all fetch boundaries first deep and end positions preserve full DTO equivalence`() {
        fixture.pool("auto").use { pool ->
            val jdbc = JdbcTemplate(pool).apply { queryTimeout = 3 }
            val reader = JdbcTelemetryPageReader(pool)
            for (actor in listOf(fixture.own("dense"), fixture.own("sparse", UserRole.OPERATOR), fixture.own("empty"))) {
                for (size in listOf(1, 100, 500)) for (position in listOf(null, "device-00075000", "zzzz")) {
                    val requested = TelemetryPageQuery(TelemetryPageSize(size), position)
                    val actual = reader.read(actor, requested)
                    assertEquals(fixture.legacy(jdbc, actor, requested), actual)
                    assertTrue(actual.size <= size + 1)
                    assertEquals(actual.map { it.uuid }.distinct(), actual.map { it.uuid })
                }
            }
        }
    }

    @Test
    fun `generic explain uses both group and UUID bounds without adding an index`() {
        fixture.pool("force_generic_plan").use { pool ->
            val jdbc = JdbcTemplate(pool).apply { queryTimeout = 3 }
            val statement = TelemetryPageStatement.forPrincipal(fixture.own("sparse"), query)
            var measured = ""
            repeat(8) {
                measured = requireNotNull(jdbc.queryForObject("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement.sql,
                    String::class.java, *statement.parameters.toTypedArray()))
            }
            val root = ObjectMapper().readTree(measured)
            val nodes = planNodes(root[0]["Plan"])
            assertTrue(nodes.any { it.path("Index Cond").asText().contains("group_id") && it.path("Index Cond").asText().contains("uuid") })
            assertEquals(0, root[0]["Plan"].path("Temp Written Blocks").asInt())
        }
    }

    private fun preparedCounts(jdbc: JdbcTemplate): List<List<Long>> = jdbc.query("""SELECT array_length(parameter_types,1), generic_plans, custom_plans
        FROM pg_prepared_statements WHERE statement LIKE '%FROM telemetry_latest%'
        AND statement NOT LIKE '%pg_prepared_statements%' AND statement NOT LIKE 'EXPLAIN%'""") { row, _ ->
        listOf(row.getLong(1), row.getLong(2), row.getLong(3))
    }

    private fun timed(read: () -> List<TelemetryReadModel>): Double {
        val started = System.nanoTime()
        read()
        return (System.nanoTime() - started) / 1_000_000.0
    }

    private fun median(values: List<Double>) = values.sorted()[values.size / 2]
    private fun p95(values: List<Double>) = values.sorted()[kotlin.math.ceil(values.size * 0.95).toInt() - 1]
    private fun planNodes(root: com.fasterxml.jackson.databind.JsonNode): List<com.fasterxml.jackson.databind.JsonNode> =
        listOf(root) + root.path("Plans").flatMap(::planNodes)

    companion object {
        @Container @JvmStatic private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
