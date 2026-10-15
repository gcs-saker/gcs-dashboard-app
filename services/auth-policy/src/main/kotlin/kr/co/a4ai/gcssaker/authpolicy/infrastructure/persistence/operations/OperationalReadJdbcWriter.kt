package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.PermissionDeniedError
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryWriteErrors
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryStorageUnavailableError
import org.springframework.dao.DataAccessException
import org.springframework.transaction.TransactionException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

internal class OperationalReadJdbcWriter(
    dataSource: javax.sql.DataSource,
    private val newLegacyEventId: () -> String = { "legacy:" + UUID.randomUUID().toString() },
) {
    private val jdbc = JdbcTemplate(dataSource)
    private val transactions = TransactionTemplate(DataSourceTransactionManager(dataSource))
    private val isPostgres = dataSource.connection.use { it.metaData.databaseProductName.equals("PostgreSQL", true) }

    init {
        jdbc.queryTimeout = 3
        transactions.timeout = 3
    }

    fun replaceTelemetry(telemetry: TelemetryReadModel): TelemetryReadModel {
        val persisted = if (isPostgres && telemetry.eventId == null) telemetry.copy(eventId = newLegacyEventId()) else telemetry
        try {
            persistTelemetry(persisted)
        } catch (error: DataAccessException) {
            if (generateSequence<Throwable>(error) { it.cause }.take(8)
                .filterIsInstance<java.sql.SQLException>().any { it.sqlState == OWNERSHIP_SQL_STATE }
            ) throw PermissionDeniedError(TelemetryWriteErrors.OWNERSHIP_CONFLICT, "telemetry write is not permitted")
            throw TelemetryStorageUnavailableError(error)
        } catch (error: TransactionException) {
            throw TelemetryStorageUnavailableError(error)
        }
        return persisted
    }

    private fun persistTelemetry(persisted: TelemetryReadModel) {
        transactions.executeWithoutResult {
            if (isPostgres) {
                jdbc.execute("SET LOCAL lock_timeout = '500ms'")
                jdbc.execute("SET LOCAL statement_timeout = '2s'")
                jdbc.update(
                    OperationalReadSql.upsertTelemetryAndHistoryPostgres,
                    *postgresTelemetryArguments(persisted),
                )
            } else {
                validateFixtureOwnership(persisted)
                jdbc.update(OperationalReadSql.deleteTelemetryByUuid, persisted.uuid)
                insertTelemetry(persisted)
                insertTelemetryHistory(persisted, persisted.observedAt ?: Instant.now())
            }
        }
    }

    private fun validateFixtureOwnership(sample: TelemetryReadModel) {
        val devices = jdbc.query("SELECT group_id, status FROM registered_devices WHERE device_uuid = ?",
            { row, _ -> row.getString("group_id") to row.getString("status") }, sample.uuid)
        val owners = if (devices.isNotEmpty()) devices.map { it.first } else
            jdbc.queryForList("SELECT group_id FROM telemetry_latest WHERE uuid = ?", String::class.java, sample.uuid)
        if (owners.any { it != sample.groupId.value } || devices.any { it.second != "active" }) {
            throw PermissionDeniedError(TelemetryWriteErrors.OWNERSHIP_CONFLICT, "telemetry write is not permitted")
        }
    }

    private companion object {
        const val OWNERSHIP_SQL_STATE = "P7401"
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
            telemetry.sessionId,
            telemetry.streamId,
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
        telemetry.sessionId,
        telemetry.streamId,
    )

    private fun postgresTelemetryArguments(telemetry: TelemetryReadModel): Array<Any?> = buildList {
        addAll(historyArguments(telemetry))
        addAll(latestArguments(telemetry))
        add(telemetry.eventId)
    }.toTypedArray()

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
            telemetry.sessionId,
            telemetry.streamId,
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
