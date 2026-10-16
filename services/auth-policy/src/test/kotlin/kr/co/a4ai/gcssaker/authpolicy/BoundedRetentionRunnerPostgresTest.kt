package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import org.testcontainers.utility.MountableFile

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
internal class BoundedRetentionRunnerPostgresTest {
    private lateinit var fixture: TelemetryRetentionFixture

    @BeforeAll
    fun initialize() {
        fixture = TelemetryRetentionFixture(postgres)
        fixture.initialize()
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/002_geo_migrations.sh"), MIGRATION_RUNNER)
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/migrations/V001__retention_time_index.sql"), MIGRATION)
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/bounded_retention_runner.sh"), RETENTION_RUNNER)
    }

    @BeforeEach
    fun reset() {
        fixture.reset()
        fixture.jdbc.execute("DROP INDEX IF EXISTS gcs_geo.idx_stream_telemetry_points_observed_at_id")
        fixture.jdbc.execute("DROP TABLE IF EXISTS gcs_geo.schema_migrations")
    }

    @AfterAll
    fun close() { if (::fixture.isInitialized) fixture.close() }

    @Test
    fun `qualified runner drains bounded batches and rerun is idempotent`() {
        qualify()
        fixture.seed(2501)
        val first = retention("GEO_RETENTION_BATCH_SIZE=1000 GEO_RETENTION_MAX_BATCHES=10")
        assertEquals(0, first.exitCode, first.stderr)
        assertTrue(first.stdout.contains("retention_result=COMPLETE batches=3 history_deleted=2501 points_deleted=2501"))
        assertEquals(1L to 0L, fixture.counts())
        val replay = retention("GEO_RETENTION_BATCH_SIZE=1000 GEO_RETENTION_MAX_BATCHES=10")
        assertEquals(0, replay.exitCode, replay.stderr)
        assertTrue(replay.stdout.contains("history_deleted=0 points_deleted=0"))
        println("bounded_retention result=PASS profile=complete batches=3 history_deleted=2501 points_deleted=2501 exit_code=0")
    }

    @Test
    fun `batch budget returns partial and next invocation resumes without loss`() {
        qualify()
        fixture.seed(2501)
        val partial = retention("GEO_RETENTION_BATCH_SIZE=1000 GEO_RETENTION_MAX_BATCHES=1")
        assertEquals(75, partial.exitCode)
        assertTrue(partial.stdout.contains("retention_result=PARTIAL batches=1 history_deleted=1000 points_deleted=1000"))
        assertEquals(1502L to 1501L, fixture.counts())
        val resumed = retention("GEO_RETENTION_BATCH_SIZE=1000 GEO_RETENTION_MAX_BATCHES=10")
        assertEquals(0, resumed.exitCode, resumed.stderr)
        assertTrue(resumed.stdout.contains("history_deleted=1501 points_deleted=1501"))
        assertEquals(1L to 0L, fixture.counts())
        println("bounded_retention result=PASS profile=resume batches=4 history_deleted=2501 points_deleted=2501 exit_code=0")
    }

    @Test
    fun `locked residual reaches zero progress bound then recovers after release`() {
        qualify()
        fixture.seed(1)
        fixture.runtime.pool.connection.use { lock ->
            lock.autoCommit = false
            try {
                lock.createStatement().use { statement ->
                    statement.queryTimeout = 3
                    statement.execute("SELECT 1 FROM telemetry_history WHERE event_id='expired-1' FOR UPDATE")
                    statement.execute("SELECT 1 FROM gcs_geo.stream_telemetry_points WHERE event_id='expired-1' FOR UPDATE")
                }
                val partial = retention("GEO_RETENTION_BATCH_SIZE=1 GEO_RETENTION_MAX_BATCHES=10")
                assertEquals(75, partial.exitCode)
                assertTrue(partial.stdout.contains("retention_result=PARTIAL batches=3 history_deleted=0 points_deleted=0"))
            } finally { lock.rollback() }
        }
        val recovered = retention("GEO_RETENTION_BATCH_SIZE=1 GEO_RETENTION_MAX_BATCHES=10")
        assertEquals(0, recovered.exitCode, recovered.stderr)
        assertTrue(recovered.stdout.contains("history_deleted=1 points_deleted=1"))
        println("bounded_retention result=PASS profile=locked_recovery batches=4 history_deleted=1 points_deleted=1 exit_code=0")
    }

    @Test
    fun `missing qualified migration blocks before any delete`() {
        fixture.seed(1)
        val result = retention("GEO_RETENTION_BATCH_SIZE=1 GEO_RETENTION_MAX_BATCHES=1")
        assertEquals(3, result.exitCode)
        assertTrue(result.stderr.contains("requires qualified geo migration"))
        assertEquals(2L to 1L, fixture.counts())
    }

    private fun qualify() {
        val result = postgres.execInContainer("bash", "-c",
            "GEO_MIGRATION_MIN_FREE_BYTES=1 GEO_MIGRATION_DIR=/tmp/gcs-geo-migrations bash $MIGRATION_RUNNER")
        assertEquals(0, result.exitCode, result.stderr)
    }

    private fun retention(overrides: String) = postgres.execInContainer("bash", "-c",
        "$overrides GEO_RETENTION_BUDGET_SECONDS=30 GEO_MIGRATION_FILE=$MIGRATION bash $RETENTION_RUNNER")

    companion object {
        const val MIGRATION_RUNNER = "/tmp/geo_migration_runner.sh"
        const val MIGRATION = "/tmp/gcs-geo-migrations/V001__retention_time_index.sql"
        const val RETENTION_RUNNER = "/tmp/bounded_retention_runner.sh"

        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(DockerImageName.parse(
            "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5",
        ).asCompatibleSubstituteFor("postgres")).apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
