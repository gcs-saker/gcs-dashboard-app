package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.sql.Timestamp
import java.time.Instant
import javax.sql.DataSource

class JdbcOperationalReadRepository(
    dataSource: DataSource,
    telemetry: Collection<TelemetryReadModel>,
    assetsByGateway: Map<String, List<AssetReadModel>>,
) : OperationalReadRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init {
        OperationalReadSchema.ensure(dataSource)
        seedTelemetry(telemetry)
        seedAssets(assetsByGateway)
    }

    override fun telemetryFor(principal: AuthenticatedPrincipal): List<TelemetryReadModel> =
        jdbc.query(
            OperationalReadSql.selectTelemetry,
            telemetryRowMapper,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

    @Synchronized
    override fun upsertTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        jdbc.update(OperationalReadSql.deleteTelemetryByUuid, telemetry.uuid)
        insertTelemetry(telemetry)
        insertTelemetryHistory(telemetry, Instant.now())
        return telemetry
    }

    override fun telemetryHistoryFor(
        principal: AuthenticatedPrincipal,
        uuid: String,
        limit: Int,
    ): List<TelemetryHistoryReadModel> =
        jdbc.query(
            OperationalReadSql.selectTelemetryHistory,
            telemetryHistoryRowMapper,
            uuid,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            limit.coerceIn(1, 500),
        )

    override fun assetsForGateway(principal: AuthenticatedPrincipal, gatewayUuid: String): List<AssetReadModel> =
        jdbc.query(
            OperationalReadSql.selectAssetsByGateway,
            assetRowMapper,
            gatewayUuid,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

    override fun recordServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel {
        jdbc.update(
            OperationalReadSql.insertServerHealthSnapshot,
            snapshot.serviceName,
            snapshot.status,
            Timestamp.from(snapshot.checkedAt),
            snapshot.latencyMs,
            snapshot.message,
            snapshot.groupId.value,
        )
        return snapshot
    }

    override fun serverHealthSnapshotsFor(
        principal: AuthenticatedPrincipal,
        limit: Int,
    ): List<ServerHealthSnapshotReadModel> =
        jdbc.query(
            OperationalReadSql.selectServerHealthSnapshots,
            serverHealthSnapshotRowMapper,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
            limit.coerceIn(1, 500),
        )

    override fun recordStreamSession(session: StreamSessionReadModel): StreamSessionReadModel {
        jdbc.update(
            OperationalReadSql.insertStreamSessionEvent,
            session.streamId,
            session.sessionId,
            session.status,
            session.source,
            Timestamp.from(session.startedAt),
            Timestamp.from(session.lastHeartbeatAt),
            session.stoppedAt?.let(Timestamp::from),
            session.groupId.value,
        )
        return session
    }

    override fun streamSessionsFor(principal: AuthenticatedPrincipal): List<StreamSessionReadModel> =
        jdbc.query(
            OperationalReadSql.selectLatestStreamSessions,
            streamSessionRowMapper,
            principal.groupId.value,
            principal.role.name,
            UserRole.ADMIN.name,
        )

    private fun seedTelemetry(telemetry: Collection<TelemetryReadModel>) {
        telemetry.forEach { item ->
            if (!telemetryExists(item.uuid)) {
                insertTelemetry(item)
            }
            if (!telemetryHistoryExists(item.uuid)) {
                insertTelemetryHistory(item, Instant.EPOCH)
            }
        }
    }

    private fun seedAssets(assetsByGateway: Map<String, List<AssetReadModel>>) {
        assetsByGateway.forEach { (gatewayUuid, assets) ->
            assets.forEach { asset ->
                if (!assetMappingExists(gatewayUuid, asset.uuid)) {
                    insertAsset(gatewayUuid, asset)
                }
            }
        }
    }

    private fun telemetryExists(uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsTelemetry, Int::class.java, uuid) ?: 0) > 0

    private fun assetMappingExists(gatewayUuid: String, uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsAssetMapping, Int::class.java, gatewayUuid, uuid) ?: 0) > 0

    private fun telemetryHistoryExists(uuid: String): Boolean =
        (jdbc.queryForObject(OperationalReadSql.existsTelemetryHistory, Int::class.java, uuid) ?: 0) > 0

    private fun insertTelemetry(telemetry: TelemetryReadModel) {
        jdbc.update(
            OperationalReadSql.insertTelemetry,
            telemetry.uuid,
            telemetry.latitude,
            telemetry.longitude,
            telemetry.altitude,
            telemetry.magneticX,
            telemetry.magneticY,
            telemetry.magneticZ,
            telemetry.soc,
            telemetry.phoneBatterySOC,
            telemetry.velocity,
            telemetry.totalDistance,
            telemetry.epochTime,
            telemetry.portDistance,
            telemetry.groupId.value,
        )
    }

    private fun insertTelemetryHistory(telemetry: TelemetryReadModel, recordedAt: Instant) {
        jdbc.update(
            OperationalReadSql.insertTelemetryHistory,
            telemetry.uuid,
            Timestamp.from(recordedAt),
            telemetry.latitude,
            telemetry.longitude,
            telemetry.altitude,
            telemetry.magneticX,
            telemetry.magneticY,
            telemetry.magneticZ,
            telemetry.soc,
            telemetry.phoneBatterySOC,
            telemetry.velocity,
            telemetry.totalDistance,
            telemetry.epochTime,
            telemetry.portDistance,
            telemetry.groupId.value,
        )
    }

    private fun insertAsset(gatewayUuid: String, asset: AssetReadModel) {
        jdbc.update(
            OperationalReadSql.insertAsset,
            gatewayUuid,
            asset.id,
            asset.cid,
            asset.uuid,
            asset.companyId,
            asset.type,
            asset.name,
            asset.description,
            asset.imageUrl,
            asset.status,
            Timestamp.from(asset.createdAt),
            Timestamp.from(asset.updatedAt),
            asset.groupId.value,
        )
    }

    private companion object {
        val telemetryRowMapper = RowMapper<TelemetryReadModel> { rs, _ ->
            TelemetryReadModel(
                uuid = rs.getString(OperationalReadColumns.uuid),
                latitude = rs.getDouble(OperationalReadColumns.latitude),
                longitude = rs.getDouble(OperationalReadColumns.longitude),
                altitude = rs.getDouble(OperationalReadColumns.altitude),
                magneticX = rs.getDouble(OperationalReadColumns.magneticX),
                magneticY = rs.getDouble(OperationalReadColumns.magneticY),
                magneticZ = rs.getDouble(OperationalReadColumns.magneticZ),
                soc = rs.getString(OperationalReadColumns.soc),
                phoneBatterySOC = rs.getDouble(OperationalReadColumns.phoneBatterySoc),
                velocity = rs.getDouble(OperationalReadColumns.velocity),
                totalDistance = rs.getDouble(OperationalReadColumns.totalDistance),
                epochTime = rs.getString(OperationalReadColumns.epochTime),
                portDistance = rs.getDouble(OperationalReadColumns.portDistance),
                groupId = GroupId(rs.getString(OperationalReadColumns.groupId)),
            )
        }

        val assetRowMapper = RowMapper<AssetReadModel> { rs, _ ->
            AssetReadModel(
                id = rs.getInt(OperationalReadColumns.id),
                cid = rs.getString(OperationalReadColumns.cid),
                uuid = rs.getString(OperationalReadColumns.uuid),
                companyId = rs.getInt(OperationalReadColumns.companyId),
                type = rs.getString(OperationalReadColumns.type),
                name = rs.getString(OperationalReadColumns.name),
                description = rs.getString(OperationalReadColumns.description),
                imageUrl = rs.getString(OperationalReadColumns.imageUrl),
                status = rs.getString(OperationalReadColumns.status),
                createdAt = rs.getTimestamp(OperationalReadColumns.createdAt).toInstant(),
                updatedAt = rs.getTimestamp(OperationalReadColumns.updatedAt).toInstant(),
                groupId = GroupId(rs.getString(OperationalReadColumns.groupId)),
            )
        }

        val telemetryHistoryRowMapper = RowMapper<TelemetryHistoryReadModel> { rs, _ ->
            TelemetryHistoryReadModel(
                recordedAt = rs.getTimestamp(OperationalReadColumns.recordedAt).toInstant(),
                telemetry = telemetryRowMapper.mapRow(rs, 0) ?: error("telemetry history row mapping failed"),
            )
        }

        val serverHealthSnapshotRowMapper = RowMapper<ServerHealthSnapshotReadModel> { rs, _ ->
            val latencyMs = rs.getLong(OperationalReadColumns.latencyMs)
            ServerHealthSnapshotReadModel(
                serviceName = rs.getString(OperationalReadColumns.serviceName),
                status = rs.getString(OperationalReadColumns.status),
                checkedAt = rs.getTimestamp(OperationalReadColumns.checkedAt).toInstant(),
                latencyMs = latencyMs.takeUnless { rs.wasNull() },
                message = rs.getString(OperationalReadColumns.message),
                groupId = GroupId(rs.getString(OperationalReadColumns.groupId)),
            )
        }

        val streamSessionRowMapper = RowMapper<StreamSessionReadModel> { rs, _ ->
            StreamSessionReadModel(
                streamId = rs.getString(OperationalReadColumns.streamId),
                sessionId = rs.getString(OperationalReadColumns.sessionId),
                status = rs.getString(OperationalReadColumns.status),
                source = rs.getString(OperationalReadColumns.source),
                startedAt = rs.getTimestamp(OperationalReadColumns.startedAt).toInstant(),
                lastHeartbeatAt = rs.getTimestamp(OperationalReadColumns.lastHeartbeatAt).toInstant(),
                stoppedAt = rs.getTimestamp(OperationalReadColumns.stoppedAt)?.toInstant(),
                groupId = GroupId(rs.getString(OperationalReadColumns.groupId)),
            )
        }
    }
}

object OperationalReadSchema {
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }
}

private object OperationalReadColumns {
    const val gatewayUuid = "gateway_uuid"
    const val id = "id"
    const val cid = "cid"
    const val uuid = "uuid"
    const val companyId = "company_id"
    const val type = "type"
    const val name = "name"
    const val description = "description"
    const val imageUrl = "image_url"
    const val status = "status"
    const val createdAt = "created_at"
    const val updatedAt = "updated_at"
    const val groupId = "group_id"
    const val latitude = "latitude"
    const val longitude = "longitude"
    const val altitude = "altitude"
    const val magneticX = "magnetic_x"
    const val magneticY = "magnetic_y"
    const val magneticZ = "magnetic_z"
    const val soc = "soc"
    const val phoneBatterySoc = "phone_battery_soc"
    const val velocity = "velocity"
    const val totalDistance = "total_distance"
    const val epochTime = "epoch_time"
    const val portDistance = "port_distance"
    const val recordedAt = "recorded_at"
    const val serviceName = "service_name"
    const val checkedAt = "checked_at"
    const val latencyMs = "latency_ms"
    const val message = "message"
    const val streamId = "stream_id"
    const val sessionId = "session_id"
    const val source = "source"
    const val startedAt = "started_at"
    const val lastHeartbeatAt = "last_heartbeat_at"
    const val stoppedAt = "stopped_at"
}

internal object OperationalReadSql {
    const val selectTelemetry = """
        SELECT uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        FROM telemetry_latest
        WHERE (group_id = ? OR ? = ?)
        ORDER BY uuid
    """
    const val selectAssetsByGateway = """
        SELECT id, cid, uuid, company_id, type, name, description, image_url,
               status, created_at, updated_at, group_id
        FROM gateway_assets
        WHERE gateway_uuid = ? AND (group_id = ? OR ? = ?)
        ORDER BY uuid
    """
    const val selectTelemetryHistory = """
        SELECT uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        FROM telemetry_history
        WHERE uuid = ? AND (group_id = ? OR ? = ?)
        ORDER BY recorded_at DESC
        LIMIT ?
    """
    const val selectServerHealthSnapshots = """
        SELECT service_name, status, checked_at, latency_ms, message, group_id
        FROM server_health_snapshots
        WHERE (group_id = ? OR ? = ?)
        ORDER BY checked_at DESC, id DESC
        LIMIT ?
    """
    const val selectLatestStreamSessions = """
        SELECT stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
        FROM stream_sessions current_session
        WHERE (group_id = ? OR ? = ?)
          AND NOT EXISTS (
              SELECT 1
              FROM stream_sessions newer_session
              WHERE newer_session.group_id = current_session.group_id
                AND newer_session.stream_id = current_session.stream_id
                AND COALESCE(newer_session.session_id, '') = COALESCE(current_session.session_id, '')
                AND (
                    newer_session.last_heartbeat_at > current_session.last_heartbeat_at
                    OR (
                        newer_session.last_heartbeat_at = current_session.last_heartbeat_at
                        AND newer_session.id > current_session.id
                    )
                )
          )
        ORDER BY last_heartbeat_at DESC, stream_id
    """
    const val deleteTelemetryByUuid = "DELETE FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetry = "SELECT COUNT(1) FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetryHistory = "SELECT COUNT(1) FROM telemetry_history WHERE uuid = ?"
    const val existsAssetMapping = "SELECT COUNT(1) FROM gateway_assets WHERE gateway_uuid = ? AND uuid = ?"
    const val insertTelemetry = """
        INSERT INTO telemetry_latest (
            uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertTelemetryHistory = """
        INSERT INTO telemetry_history (
            uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertAsset = """
        INSERT INTO gateway_assets (
            gateway_uuid, id, cid, uuid, company_id, type, name, description, image_url,
            status, created_at, updated_at, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertServerHealthSnapshot = """
        INSERT INTO server_health_snapshots (
            service_name, status, checked_at, latency_ms, message, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """
    const val insertStreamSessionEvent = """
        INSERT INTO stream_sessions (
            stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
}
