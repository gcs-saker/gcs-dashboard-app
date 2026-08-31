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
    private val writer = OperationalReadJdbcWriter(dataSource)
    private val seeder = OperationalReadSeeder(jdbc, writer)

    init {
        OperationalReadSchema.ensure(dataSource)
        seeder.seedTelemetry(telemetry)
        seeder.seedAssets(assetsByGateway)
    }

    override fun telemetryFor(principal: AuthenticatedPrincipal, limit: Int, offset: Int): List<TelemetryReadModel> =
        jdbc.query(
            OperationalReadSql.selectTelemetry,
            OperationalReadRowMappers.telemetry,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            principal.role.name,
            principal.groupId.value,
            limit,
            offset,
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
            principal.role.name,
            principal.groupId.value,
            limit.coerceIn(1, 500),
        )

    override fun assetsForGateway(
        principal: AuthenticatedPrincipal, gatewayUuid: String, limit: Int, offset: Int,
    ): List<AssetReadModel> =
        jdbc.query(
            OperationalReadSql.selectAssetsByGateway,
            OperationalReadRowMappers.asset,
            gatewayUuid,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            principal.role.name,
            principal.groupId.value,
            limit,
            offset,
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
            principal.role.name,
            principal.groupId.value,
            limit.coerceIn(1, 500),
        )

    override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel =
        writer.insertStreamSessionEvent(session)

    override fun streamSessionsFor(principal: AuthenticatedPrincipal, limit: Int, offset: Int): List<StreamSessionReadModel> =
        jdbc.query(
            OperationalReadSql.selectLatestStreamSessions,
            OperationalReadRowMappers.streamSession,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            principal.role.name,
            principal.groupId.value,
            limit,
            offset,
        )

}

object OperationalReadSchema {
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }
}
