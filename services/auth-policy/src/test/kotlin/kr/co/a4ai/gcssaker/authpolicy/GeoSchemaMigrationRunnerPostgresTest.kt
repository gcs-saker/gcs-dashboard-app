package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.AuthPolicyDatabaseInitializer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import org.testcontainers.utility.MountableFile
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
internal class GeoSchemaMigrationRunnerPostgresTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var source: DriverManagerDataSource

    @BeforeAll
    fun copyRunner() {
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/002_geo_migrations.sh"), RUNNER)
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/migrations/V001__retention_time_index.sql"), MIGRATION)
        source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        jdbc = JdbcTemplate(source).apply { queryTimeout = 5 }
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
    }

    @BeforeEach
    fun reset() {
        jdbc.execute(Files.readString(Path.of("../../deploy/postgres/init/001_geo_telemetry.sql")))
        jdbc.execute("DROP INDEX IF EXISTS gcs_geo.idx_stream_telemetry_points_observed_at_id")
        jdbc.execute("DROP TABLE IF EXISTS gcs_geo.schema_migrations")
        jdbc.execute("TRUNCATE gcs_geo.stream_telemetry_points, gcs_geo.stream_telemetry_latest, telemetry_history, telemetry_latest")
    }

    @Test
    fun `first apply and rerun produce one valid recorded index`() {
        assertSuccess(run())
        assertIndexValid()
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
        assertSuccess(run())
        assertIndexValid()
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
    }

    @Test
    fun `checksum mismatch fails closed without rebuilding the valid index`() {
        assertSuccess(run())
        jdbc.update("UPDATE gcs_geo.schema_migrations SET checksum_sha256=?", "0".repeat(64))
        val result = run()
        assertNotEquals(0, result.exitCode)
        assertTrue(result.stderr.contains("checksum mismatch"))
        assertIndexValid()
    }

    @Test
    fun `same name with incompatible definition is never accepted or dropped`() {
        jdbc.execute("CREATE INDEX idx_stream_telemetry_points_observed_at_id ON gcs_geo.stream_telemetry_points(id)")
        val result = run()
        assertNotEquals(0, result.exitCode)
        assertTrue(result.stderr.contains("invalid or incompatible"))
        assertTrue(indexDefinition().endsWith("(id)"))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
    }

    @Test
    fun `disk preflight blocks before any catalog or index mutation`() {
        val result = run("GEO_MIGRATION_MIN_FREE_BYTES=999999999999999999")
        assertEquals(3, result.exitCode)
        assertTrue(result.stderr.contains("disk preflight failed"))
        val absentIndex: String? = jdbc.queryForObject(
            "SELECT to_regclass('gcs_geo.idx_stream_telemetry_points_observed_at_id')", String::class.java,
        )
        assertEquals(null, absentIndex)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
    }

    @Test
    fun `concurrent build obeys lock deadline and leaves no migration record`() {
        postgres.jdbcUrl.let { DriverManagerDataSource(it, postgres.username, postgres.password).connection }.use { lock ->
            lock.autoCommit = false
            try {
                lock.createStatement().use { it.queryTimeout = 3; it.execute("LOCK gcs_geo.stream_telemetry_points IN ACCESS EXCLUSIVE MODE") }
                val result = run("GEO_MIGRATION_LOCK_TIMEOUT_MS=100 GEO_MIGRATION_STATEMENT_TIMEOUT_MS=1000")
                assertNotEquals(0, result.exitCode)
            } finally { lock.rollback() }
        }
        val absentIndex: String? = jdbc.queryForObject(
            "SELECT to_regclass('gcs_geo.idx_stream_telemetry_points_observed_at_id')", String::class.java,
        )
        assertEquals(null, absentIndex)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
        assertSuccess(run())
        assertIndexValid()
    }

    @Test
    fun `custom dump restores migration history schema and valid index into isolated database`() {
        assertSuccess(run())
        val sourceTables = requireNotNull(jdbc.queryForObject("""SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema='gcs_geo'""", Int::class.java))
        val restored = postgres.execInContainer("bash", "-c", """set -e
            pg_dump -Fc -f /tmp/gcs-geo-qualified.dump -U "${'$'}POSTGRES_USER" "${'$'}POSTGRES_DB"
            dropdb --if-exists -U "${'$'}POSTGRES_USER" geo_restore_fixture
            createdb -U "${'$'}POSTGRES_USER" geo_restore_fixture
            pg_restore --exit-on-error -U "${'$'}POSTGRES_USER" -d geo_restore_fixture /tmp/gcs-geo-qualified.dump
            bytes=${'$'}(stat -c %s /tmp/gcs-geo-qualified.dump)
            digest=${'$'}(sha256sum /tmp/gcs-geo-qualified.dump | cut -d' ' -f1)
            tables=${'$'}(psql -U "${'$'}POSTGRES_USER" -d geo_restore_fixture -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='gcs_geo'")
            migrations=${'$'}(psql -U "${'$'}POSTGRES_USER" -d geo_restore_fixture -Atc "SELECT COUNT(*) FROM gcs_geo.schema_migrations")
            valid=${'$'}(psql -U "${'$'}POSTGRES_USER" -d geo_restore_fixture -Atc "SELECT COUNT(*) FROM pg_index WHERE indexrelid='gcs_geo.idx_stream_telemetry_points_observed_at_id'::regclass AND indisvalid AND indisready")
            printf '%s|%s|%s|%s|%s\n' "${'$'}bytes" "${'$'}digest" "${'$'}tables" "${'$'}migrations" "${'$'}valid"
            """)
        assertEquals(0, restored.exitCode, restored.stderr)
        val values = restored.stdout.trim().lineSequence().last().split('|')
        assertEquals(5, values.size)
        assertTrue(values[0].toLong() > 0 && values[1].matches(Regex("[0-9a-f]{64}")))
        assertEquals(sourceTables, values[2].toInt())
        assertEquals(listOf("1", "1"), values.drop(3))
        println("geo_migration_backup result=PASS dump_bytes=${values[0]} digest_verified=1 " +
            "source_tables=$sourceTables restored_tables=${values[2]} migrations=${values[3]} index_valid=${values[4]}")
        assertEquals(0, postgres.execInContainer("dropdb", "-U", postgres.username, "geo_restore_fixture").exitCode)
    }

    @RepeatedTest(SOAK_REPETITIONS)
    fun `concurrent build admits reads and writes then bounded retention has no spill`(repetition: RepetitionInfo) {
        seedPoints(500_000)
        jdbc.execute("ANALYZE gcs_geo.stream_telemetry_points")
        val executor = Executors.newSingleThreadExecutor()
        try {
            val building = executor.submit<org.testcontainers.containers.Container.ExecResult> { run() }
            assertTrue(awaitConcurrentBuild(building))
            val writeLatencies = mutableListOf<Double>()
            val readLatencies = mutableListOf<Double>()
            repeat(16) { index ->
                writeLatencies.add(timed { seedPoints(1, 600_001 + index) })
                readLatencies.add(timed { jdbc.queryForObject(
                    "SELECT COUNT(*) FROM gcs_geo.stream_telemetry_points WHERE observed_at >= TIMESTAMPTZ '2026-01-01'",
                    Long::class.java,
                ) })
            }
            assertSuccess(building.get(30, TimeUnit.SECONDS))
            assertIndexValid()
            jdbc.execute("SELECT pg_stat_statements_reset()")
            val transactions = TransactionTemplate(DataSourceTransactionManager(source)).apply { timeout = 5 }
            transactions.executeWithoutResult {
                jdbc.execute("SET LOCAL statement_timeout='2s'")
                jdbc.execute("SET LOCAL lock_timeout='500ms'")
                jdbc.queryForMap("SELECT * FROM public.prune_telemetry_history_batch(30,1000,CURRENT_TIMESTAMP)")
            }
            val tempWritten = requireNotNull(jdbc.queryForObject("""SELECT COALESCE(SUM(temp_blks_written),0)::bigint
                FROM pg_stat_statements WHERE query LIKE 'SELECT * FROM public.prune_telemetry_history_batch%'""", Long::class.java))
            assertEquals(0, tempWritten)
            assertTrue(p95(writeLatencies) < ACCEPTANCE_P95_MS && p95(readLatencies) < ACCEPTANCE_P95_MS)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM gcs_geo.schema_migrations", Int::class.java))
            println("geo_migration_load result=PASS repetition=${repetition.currentRepetition} rows=500000 " +
                "writes=${writeLatencies.size} reads=${readLatencies.size} " +
                "write_p95_ms=${p95(writeLatencies)} read_p95_ms=${p95(readLatencies)} progress_seen=1 retention_temp_written=$tempWritten")
        } finally {
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    private fun run(overrides: String = "") = postgres.execInContainer("bash", "-c",
        "GEO_MIGRATION_MIN_FREE_BYTES=1 $overrides GEO_MIGRATION_DIR=/tmp/gcs-geo-migrations bash $RUNNER")

    private fun assertSuccess(result: org.testcontainers.containers.Container.ExecResult) {
        assertEquals(0, result.exitCode, result.stderr)
    }

    private fun seedPoints(rows: Int, first: Int = 1) {
        for (start in first until first + rows step 50_000) {
            val end = minOf(start + 49_999, first + rows - 1)
            jdbc.update("""INSERT INTO gcs_geo.stream_telemetry_points
                (org_id,group_id,asset_id,stream_id,event_id,observed_at,position,source_protocol,payload_format)
                SELECT 'fixture','co-a','fixture','fixture','qualified-'||i,TIMESTAMPTZ '2026-01-01',
                ST_SetSRID(ST_MakePoint(128,35),4326),'fixture','fixture' FROM generate_series(?,?) i""",
                start, end)
        }
    }

    private fun awaitConcurrentBuild(building: java.util.concurrent.Future<*>): Boolean {
        repeat(500) {
            val active = jdbc.queryForObject("""SELECT COUNT(*) FROM pg_stat_progress_create_index p
                JOIN pg_class c ON c.oid=p.index_relid JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='gcs_geo' AND c.relname='idx_stream_telemetry_points_observed_at_id'""", Int::class.java) ?: 0
            if (active > 0) return true
            if (building.isDone) return false
            Thread.sleep(10)
        }
        return false
    }

    private fun timed(command: () -> Any?): Double {
        val started = System.nanoTime()
        command()
        return (System.nanoTime() - started) / 1_000_000.0
    }

    private fun p95(values: List<Double>) = values.sorted()[kotlin.math.ceil(values.size * 0.95).toInt() - 1]

    private fun assertIndexValid() {
        assertEquals(1, jdbc.queryForObject("""SELECT COUNT(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            WHERE c.oid='gcs_geo.idx_stream_telemetry_points_observed_at_id'::regclass AND i.indisvalid AND i.indisready""", Int::class.java))
        assertTrue(indexDefinition().endsWith("(observed_at, id)"))
    }

    private fun indexDefinition() = requireNotNull(jdbc.queryForObject(
        "SELECT pg_get_indexdef('gcs_geo.idx_stream_telemetry_points_observed_at_id'::regclass)", String::class.java,
    ))

    companion object {
        const val RUNNER = "/tmp/geo_migration_runner.sh"
        const val MIGRATION = "/tmp/gcs-geo-migrations/V001__retention_time_index.sql"
        const val SOAK_REPETITIONS = 3
        const val ACCEPTANCE_P95_MS = 500.0

        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(DockerImageName.parse(
            "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5",
        ).asCompatibleSubstituteFor("postgres")).apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
