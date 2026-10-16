package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import org.testcontainers.utility.MountableFile
import java.nio.file.Files
import java.nio.file.Path

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
internal class GeoSchemaMigrationRunnerPostgresTest {
    private lateinit var jdbc: JdbcTemplate

    @BeforeAll
    fun copyRunner() {
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/002_geo_migrations.sh"), RUNNER)
        postgres.copyFileToContainer(MountableFile.forHostPath("../../deploy/postgres/init/migrations/V001__retention_time_index.sql"), MIGRATION)
        jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)).apply { queryTimeout = 5 }
    }

    @BeforeEach
    fun reset() {
        jdbc.execute(Files.readString(Path.of("../../deploy/postgres/init/001_geo_telemetry.sql")))
        jdbc.execute("DROP INDEX IF EXISTS gcs_geo.idx_stream_telemetry_points_observed_at_id")
        jdbc.execute("DROP TABLE IF EXISTS gcs_geo.schema_migrations")
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

    private fun run(overrides: String = "") = postgres.execInContainer("bash", "-c",
        "GEO_MIGRATION_MIN_FREE_BYTES=1 $overrides GEO_MIGRATION_DIR=/tmp/gcs-geo-migrations bash $RUNNER")

    private fun assertSuccess(result: org.testcontainers.containers.Container.ExecResult) {
        assertEquals(0, result.exitCode, result.stderr)
    }

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

        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(DockerImageName.parse(
            "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5",
        ).asCompatibleSubstituteFor("postgres"))
    }
}
