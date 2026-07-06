package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.jdbc.core.RowMapper

internal object OperationalReadRowMappers {
    val telemetry = RowMapper<TelemetryReadModel> { rs, _ ->
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

    val asset = RowMapper<AssetReadModel> { rs, _ ->
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

    val telemetryHistory = RowMapper<TelemetryHistoryReadModel> { rs, _ ->
        TelemetryHistoryReadModel(
            recordedAt = rs.getTimestamp(OperationalReadColumns.recordedAt).toInstant(),
            telemetry = telemetry.mapRow(rs, 0) ?: error("telemetry history row mapping failed"),
        )
    }

    val serverHealthSnapshot = RowMapper<ServerHealthSnapshotReadModel> { rs, _ ->
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

    val streamSession = RowMapper<StreamSessionReadModel> { rs, _ ->
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

internal object OperationalReadColumns {
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
