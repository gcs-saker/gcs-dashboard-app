package kr.co.a4ai.gcssaker.authpolicy

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.Properties

internal class TelemetryOwnGroupJdbcFixture(private val postgres: PostgreSQLContainer<*>) {
    private val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password).apply {
        setConnectionProperties(Properties().apply { setProperty("connectTimeout", "3"); setProperty("socketTimeout", "30") })
    }
    val jdbc = JdbcTemplate(source).apply { queryTimeout = 30 }
    val rows = 100_000

    fun initialize() {
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        val parent = OrganizationUnit(GroupId("parent"), "Parent", GroupType.BATTALION)
        val children = (listOf("dense", "sparse", "empty") + (0..31).map { "child-$it" }).map {
            OrganizationUnit(GroupId(it), it, GroupType.COMPANY, parent.id)
        }
        JdbcOrganizationHierarchyRepository(source, listOf(parent) + children +
            OrganizationUnit(GroupId("outside"), "Outside", GroupType.COMPANY))
        seedTelemetry()
        jdbc.update("""INSERT INTO telemetry_latest (uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id)
            VALUES ('outside-fixture',35,128,0,0,0,0,'50',50,0,0,'0',0,'outside')""")
        jdbc.execute("ANALYZE telemetry_latest")
        jdbc.execute("ANALYZE organization_group_closure")
    }

    private fun seedTelemetry() {
        // Real ownership triggers acquire per-identity transaction locks; bound fixture transactions, not lock protection.
        for (first in 1..rows step SEED_BATCH_SIZE) jdbc.update("""INSERT INTO telemetry_latest (uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id)
            SELECT 'device-' || LPAD(i::text, 8, '0'), 35, 128, 0, 0, 0, 0, '50', 50, 0, 0, '0', 0,
            CASE WHEN MOD(i,1000)=0 THEN 'sparse' WHEN MOD(i,10)=0 THEN 'child-' || MOD(i/10,32) ELSE 'dense' END
            FROM generate_series(?, ?) i""", first, minOf(first + SEED_BATCH_SIZE - 1, rows))
    }

    fun pool(mode: String): HikariDataSource = HikariDataSource(HikariConfig().apply {
        jdbcUrl = postgres.jdbcUrl
        username = postgres.username
        password = postgres.password
        maximumPoolSize = 1
        minimumIdle = 0
        connectionTimeout = 1_000
        validationTimeout = 500
        connectionInitSql = "SET plan_cache_mode = $mode"
        addDataSourceProperty("prepareThreshold", "5")
        addDataSourceProperty("connectTimeout", "3")
        addDataSourceProperty("socketTimeout", "5")
    })

    fun legacy(jdbc: JdbcTemplate, principal: AuthenticatedPrincipal, query: TelemetryPageQuery): List<TelemetryReadModel> {
        // Test-only pre-change reader from cbd8b323; retire with #920 comparison qualification.
        val sql = StringBuilder(OperationalReadSql.selectTelemetryBase)
        val parameters = mutableListOf<Any>(principal.groupId.value, principal.role.name, UserRole.ADMIN.name,
            principal.role.name, principal.groupId.value)
        query.afterUuid?.let { sql.append(OperationalReadSql.andTelemetryAfterUuid); parameters.add(it) }
        sql.append(OperationalReadSql.orderTelemetryPage)
        parameters.add(query.size.fetchLimit)
        return jdbc.query(sql.toString(), OperationalReadRowMappers.telemetry, *parameters.toTypedArray())
    }

    fun own(group: String, role: UserRole = UserRole.VIEWER) = AuthenticatedPrincipal("fixture-$group-${role.name.lowercase()}", role, GroupId(group))

    private companion object { const val SEED_BATCH_SIZE = 1_000 }
}
