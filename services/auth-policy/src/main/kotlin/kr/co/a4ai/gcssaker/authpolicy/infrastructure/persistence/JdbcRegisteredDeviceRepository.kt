package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceType
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import javax.sql.DataSource

class JdbcRegisteredDeviceRepository(
    dataSource: DataSource,
) : RegisteredDeviceRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val metadata = JdbcRegisteredDeviceMetadataDao(jdbc)

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }

    override fun findByDeviceUuid(deviceUuid: String): RegisteredDevice? =
        jdbc.query(RegisteredDeviceSql.selectByUuid, rowMapper, deviceUuid)
            .firstOrNull()
            ?.let { metadata.attach(listOf(it)).first() }

    override fun list(): List<RegisteredDevice> =
        metadata.attach(jdbc.query(RegisteredDeviceSql.selectAll, rowMapper))

    @Synchronized
    override fun save(device: RegisteredDevice): RegisteredDevice {
        if (findByDeviceUuid(device.deviceUuid) == null) {
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
        } else {
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
        metadata.replace(device)
        return device
    }

    private companion object {
        val rowMapper = RowMapper<RegisteredDevice> { rs, _ ->
            RegisteredDevice(
                deviceUuid = rs.getString(RegisteredDeviceColumns.deviceUuid),
                groupId = GroupId(rs.getString(RegisteredDeviceColumns.groupId)),
                displayName = rs.getString(RegisteredDeviceColumns.displayName),
                credentialHash = rs.getString(RegisteredDeviceColumns.credentialHash),
                status = RegisteredDeviceStatus.valueOf(rs.getString(RegisteredDeviceColumns.status).uppercase()),
                deviceType = DeviceType.entries.first { it.apiValue == rs.getString(RegisteredDeviceColumns.deviceType) },
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
    const val selectAll = """
        SELECT device_uuid, group_id, display_name, credential_hash, status, device_type, credential_version, policy_version
        FROM registered_devices
        ORDER BY device_uuid ASC
    """
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
