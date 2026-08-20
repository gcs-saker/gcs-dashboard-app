package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceType
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.core.RowMapper
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

class JdbcRegisteredDeviceRepository(
    dataSource: DataSource,
) : RegisteredDeviceRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val metadata = JdbcRegisteredDeviceMetadataDao(jdbc)
    private val transactions = TransactionTemplate(DataSourceTransactionManager(dataSource))

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }

    override fun findByDeviceUuid(deviceUuid: String): RegisteredDevice? =
        jdbc.query(RegisteredDeviceSql.selectByUuid, rowMapper, deviceUuid)
            .firstOrNull()
            ?.let { metadata.attach(listOf(it)).first() }

    override fun list(limit: Int, offset: Int): List<RegisteredDevice> =
        metadata.attach(jdbc.query(RegisteredDeviceSql.selectPage, rowMapper, limit, offset))

    override fun listByGroup(groupId: GroupId, limit: Int, offset: Int): List<RegisteredDevice> =
        metadata.attach(jdbc.query(RegisteredDeviceSql.selectPageByGroup, rowMapper, groupId.value, limit, offset))

    override fun hasActiveInGroup(groupId: GroupId): Boolean =
        jdbc.queryForObject(
            RegisteredDeviceSql.countActiveByGroup, Int::class.java,
            groupId.value, RegisteredDeviceStatus.ACTIVE.name.lowercase(),
        ) != 0

    @Synchronized
    override fun save(device: RegisteredDevice): RegisteredDevice =
        transactions.execute {
            if (findByDeviceUuid(device.deviceUuid) == null) {
                insert(device)
            } else {
                update(device)
            }
            metadata.replace(device)
            device
        } ?: error("device save transaction returned no result")

    private fun insert(device: RegisteredDevice) {
        jdbc.update(
            RegisteredDeviceSql.insert,
            device.deviceUuid,
            device.groupId.value,
            device.displayName,
            device.credentialHash,
            device.status.name.lowercase(),
            device.deviceType.apiValue,
            device.credentialVersion,
            device.policyVersion,
        )
    }

    private fun update(device: RegisteredDevice) {
        jdbc.update(
            RegisteredDeviceSql.update,
            device.groupId.value,
            device.displayName,
            device.credentialHash,
            device.status.name.lowercase(),
            device.deviceType.apiValue,
            device.credentialVersion,
            device.policyVersion,
            device.deviceUuid,
        )
    }

    private companion object {
        val rowMapper = RowMapper<RegisteredDevice> { rs, _ ->
            RegisteredDevice(
                deviceUuid = rs.getString(RegisteredDeviceColumns.deviceUuid),
                groupId = GroupId(rs.getString(RegisteredDeviceColumns.groupId)),
                displayName = rs.getString(RegisteredDeviceColumns.displayName),
                credentialHash = rs.getString(RegisteredDeviceColumns.credentialHash),
                status = RegisteredDeviceStatus.fromPersistence(rs.getString(RegisteredDeviceColumns.status)),
                deviceType =
                    DeviceType.parse(rs.getString(RegisteredDeviceColumns.deviceType))
                        ?: throw IllegalArgumentException("unsupported registered device type"),
                credentialVersion = rs.getLong(RegisteredDeviceColumns.credentialVersion),
                policyVersion = rs.getLong(RegisteredDeviceColumns.policyVersion),
            )
        }
    }
}

private object RegisteredDeviceColumns {
    const val deviceUuid = "device_uuid"
    const val groupId = "group_id"
    const val displayName = "display_name"
    const val credentialHash = "credential_hash"
    const val status = "status"
    const val deviceType = "device_type"
    const val credentialVersion = "credential_version"
    const val policyVersion = "policy_version"
}

private object RegisteredDeviceSql {
    const val selectPage = """
        SELECT device_uuid, group_id, display_name, credential_hash, status, device_type, credential_version, policy_version
        FROM registered_devices
        ORDER BY device_uuid ASC LIMIT ? OFFSET ?
    """
    const val selectPageByGroup = """
        SELECT device_uuid, group_id, display_name, credential_hash, status, device_type, credential_version, policy_version
        FROM registered_devices WHERE group_id = ?
        ORDER BY device_uuid ASC LIMIT ? OFFSET ?
    """
    const val countActiveByGroup = "SELECT COUNT(*) FROM registered_devices WHERE group_id = ? AND status = ?"
    const val selectByUuid = """
        SELECT device_uuid, group_id, display_name, credential_hash, status, device_type, credential_version, policy_version
        FROM registered_devices
        WHERE device_uuid = ?
    """
    const val insert = """
        INSERT INTO registered_devices (device_uuid, group_id, display_name, credential_hash, status, device_type, credential_version, policy_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val update = """
        UPDATE registered_devices
        SET group_id = ?, display_name = ?, credential_hash = ?, status = ?, device_type = ?, credential_version = ?, policy_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE device_uuid = ?
    """
}
