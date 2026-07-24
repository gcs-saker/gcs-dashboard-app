package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant

internal class OperationalReadJdbcWriter(
    private val jdbc: JdbcTemplate,
) {
    fun replaceTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        jdbc.update(OperationalReadSql.deleteTelemetryByUuid, telemetry.uuid)
        insertTelemetry(telemetry)
        insertTelemetryHistory(telemetry, Instant.now())
        return telemetry
    }

    fun insertTelemetry(telemetry: TelemetryReadModel) {
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
            telemetry.batteryPercent,
            telemetry.headingDeg,
            telemetry.rollDeg,
            telemetry.pitchDeg,
            telemetry.yawDeg,
            telemetry.linkQualityPercent,
            telemetry.observedAt?.let(Timestamp::from),
        )
    }

    fun insertTelemetryHistory(telemetry: TelemetryReadModel, recordedAt: Instant) {
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
            telemetry.batteryPercent,
            telemetry.headingDeg,
            telemetry.rollDeg,
            telemetry.pitchDeg,
            telemetry.yawDeg,
            telemetry.linkQualityPercent,
            telemetry.observedAt?.let(Timestamp::from),
        )
    }

    fun insertAsset(gatewayUuid: String, asset: AssetReadModel) {
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

    fun insertServerHealthSnapshot(snapshot: ServerHealthSnapshotReadModel): ServerHealthSnapshotReadModel {
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

    fun insertStreamSessionEvent(session: StreamSessionReadModel): StreamSessionReadModel {
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
}
