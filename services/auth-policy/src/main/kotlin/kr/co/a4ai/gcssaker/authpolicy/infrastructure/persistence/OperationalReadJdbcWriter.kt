package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant

internal class OperationalReadJdbcWriter(
    dataSource: javax.sql.DataSource,
) {
    private val jdbc = JdbcTemplate(dataSource)
    private val transactions = TransactionTemplate(DataSourceTransactionManager(dataSource))
    private val isPostgres = dataSource.connection.use { it.metaData.databaseProductName.equals("PostgreSQL", true) }

    fun replaceTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        transactions.executeWithoutResult {
            if (isPostgres) {
                val insertedHistoryRows =
                    jdbc.update(OperationalReadSql.insertTelemetryHistoryPostgres, *historyArguments(telemetry))
                if (telemetry.eventId == null || insertedHistoryRows == 1) {
                    jdbc.update(OperationalReadSql.upsertTelemetryPostgres, *latestArguments(telemetry))
                }
            } else {
                jdbc.update(OperationalReadSql.deleteTelemetryByUuid, telemetry.uuid)
                insertTelemetry(telemetry)
                insertTelemetryHistory(telemetry, telemetry.observedAt ?: Instant.now())
            }
        }
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

    private fun latestArguments(telemetry: TelemetryReadModel): Array<Any?> = arrayOf(
        telemetry.eventId,
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

    private fun historyArguments(telemetry: TelemetryReadModel): Array<Any?> = arrayOf(
        telemetry.eventId,
        telemetry.uuid,
        Timestamp.from(telemetry.observedAt ?: Instant.now()),
        *latestArguments(telemetry).drop(2).toTypedArray(),
    )

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
