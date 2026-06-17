package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
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
        OperationalReadSchema.ensure(jdbc)
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
    }
}

object OperationalReadSchema {
    fun ensure(jdbc: JdbcTemplate) {
        jdbc.execute(OperationalReadSql.createTelemetryTable)
        jdbc.createIndexIfMissing(OperationalReadSql.telemetryGroupUuidIndex)
        jdbc.execute(OperationalReadSql.createTelemetryHistoryTable)
        OperationalReadSql.alterTelemetryHistoryTimestampColumns.forEach { statement -> runCatching { jdbc.execute(statement) } }
        jdbc.createIndexIfMissing(OperationalReadSql.telemetryHistoryUuidRecordedIndex)
        jdbc.execute(OperationalReadSql.createAssetTable)
        OperationalReadSql.alterAssetTimestampColumns.forEach { statement -> runCatching { jdbc.execute(statement) } }
        jdbc.createIndexIfMissing(OperationalReadSql.assetGatewayGroupIndex)
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
}

private object OperationalReadSql {
    const val telemetryTable = "telemetry_latest"
    const val telemetryHistoryTable = "telemetry_history"
    const val assetTable = "gateway_assets"
    const val telemetryGroupUuidIndexName = "ix_telemetry_latest_group_uuid"
    const val telemetryHistoryUuidRecordedIndexName = "ix_telemetry_history_uuid_recorded"
    const val assetGatewayGroupIndexName = "ix_gateway_assets_gateway_group"
    const val createTelemetryTable = """
        CREATE TABLE IF NOT EXISTS telemetry_latest (
            uuid VARCHAR(128) NOT NULL PRIMARY KEY,
            latitude DOUBLE NOT NULL,
            longitude DOUBLE NOT NULL,
            altitude DOUBLE NOT NULL,
            magnetic_x DOUBLE NOT NULL,
            magnetic_y DOUBLE NOT NULL,
            magnetic_z DOUBLE NOT NULL,
            soc VARCHAR(32) NOT NULL,
            phone_battery_soc DOUBLE NOT NULL,
            velocity DOUBLE NOT NULL,
            total_distance DOUBLE NOT NULL,
            epoch_time VARCHAR(32) NOT NULL,
            port_distance DOUBLE NOT NULL,
            group_id VARCHAR(64) NOT NULL
        )
    """
    val telemetryGroupUuidIndex = JdbcIndexDefinition(
        name = telemetryGroupUuidIndexName,
        table = telemetryTable,
        columns = listOf(OperationalReadColumns.groupId, OperationalReadColumns.uuid),
    )
    const val createTelemetryHistoryTable = """
        CREATE TABLE IF NOT EXISTS telemetry_history (
            uuid VARCHAR(128) NOT NULL,
            recorded_at DATETIME(3) NOT NULL,
            latitude DOUBLE NOT NULL,
            longitude DOUBLE NOT NULL,
            altitude DOUBLE NOT NULL,
            magnetic_x DOUBLE NOT NULL,
            magnetic_y DOUBLE NOT NULL,
            magnetic_z DOUBLE NOT NULL,
            soc VARCHAR(32) NOT NULL,
            phone_battery_soc DOUBLE NOT NULL,
            velocity DOUBLE NOT NULL,
            total_distance DOUBLE NOT NULL,
            epoch_time VARCHAR(32) NOT NULL,
            port_distance DOUBLE NOT NULL,
            group_id VARCHAR(64) NOT NULL
        )
    """
    val telemetryHistoryUuidRecordedIndex = JdbcIndexDefinition(
        name = telemetryHistoryUuidRecordedIndexName,
        table = telemetryHistoryTable,
        columns = listOf(OperationalReadColumns.uuid, OperationalReadColumns.recordedAt),
    )
    val alterTelemetryHistoryTimestampColumns = listOf(
        "ALTER TABLE $telemetryHistoryTable MODIFY ${OperationalReadColumns.recordedAt} DATETIME(3) NOT NULL",
    )
    const val createAssetTable = """
        CREATE TABLE IF NOT EXISTS gateway_assets (
            gateway_uuid VARCHAR(128) NOT NULL,
            id INT NOT NULL,
            cid VARCHAR(128) NOT NULL,
            uuid VARCHAR(128) NOT NULL,
            company_id INT NOT NULL,
            type VARCHAR(64) NOT NULL,
            name VARCHAR(128) NOT NULL,
            description VARCHAR(512),
            image_url VARCHAR(512),
            status VARCHAR(32) NOT NULL,
            created_at DATETIME(3) NOT NULL,
            updated_at DATETIME(3) NOT NULL,
            group_id VARCHAR(64) NOT NULL,
            PRIMARY KEY (gateway_uuid, uuid)
        )
    """
    val assetGatewayGroupIndex = JdbcIndexDefinition(
        name = assetGatewayGroupIndexName,
        table = assetTable,
        columns = listOf(OperationalReadColumns.gatewayUuid, OperationalReadColumns.groupId),
    )
    val alterAssetTimestampColumns = listOf(
        "ALTER TABLE $assetTable MODIFY ${OperationalReadColumns.createdAt} DATETIME(3) NOT NULL",
        "ALTER TABLE $assetTable MODIFY ${OperationalReadColumns.updatedAt} DATETIME(3) NOT NULL",
    )
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
}
