package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

class JdbcOperationalReadRepository(
    dataSource: DataSource,
    telemetry: Collection<TelemetryReadModel>,
    assetsByGateway: Map<String, List<AssetReadModel>>,
) : OperationalReadRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val writer = OperationalReadJdbcWriter(jdbc)
    private val seeder = OperationalReadSeeder(jdbc, writer)

    init {
        OperationalReadSchema.ensure(dataSource)
        seeder.seedTelemetry(telemetry)
        seeder.seedAssets(assetsByGateway)
    }

    override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> =
        jdbc.query(
            OperationalReadSql.selectTelemetry,
            OperationalReadRowMappers.telemetry,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

    @Synchronized
    override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel =
        writer.replaceTelemetry(telemetry)

    override fun telemetryHistoryFor(
        principal: AuthenticatedPrincipal,
        uuid: String,
        limit: Int,
    ): List<TelemetryHistoryReadModel> =
        jdbc.query(
            OperationalReadSql.selectTelemetryHistory,
            OperationalReadRowMappers.telemetryHistory,
            uuid,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            limit.coerceIn(1, 500),
        )

    override fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel> =
        jdbc.query(
            OperationalReadSql.selectAssetsByGateway,
            OperationalReadRowMappers.asset,
            gatewayUuid,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

    override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel =
        writer.insertServerHealthSnapshot(snapshot)

    override fun serverHealthSnapshotsFor(
        principal: AuthenticatedPrincipal,
        limit: Int,
    ): List<ServerHealthSnapshotReadModel> =
        jdbc.query(
            OperationalReadSql.selectServerHealthSnapshots,
            OperationalReadRowMappers.serverHealthSnapshot,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            limit.coerceIn(1, 500),
        )

    override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel =
        writer.insertStreamSessionEvent(session)

    override fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel> =
        jdbc.query(
            OperationalReadSql.selectLatestStreamSessions,
            OperationalReadRowMappers.streamSession,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

}

object OperationalReadSchema {
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }
}
