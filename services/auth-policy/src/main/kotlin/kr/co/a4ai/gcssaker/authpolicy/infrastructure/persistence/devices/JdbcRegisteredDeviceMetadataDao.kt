package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensor
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceSensors
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStream
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStreams
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper

internal class JdbcRegisteredDeviceMetadataDao(
    private val jdbc: JdbcTemplate,
) {
    fun attach(devices: List<RegisteredDevice>): List<RegisteredDevice> {
        if (devices.isEmpty()) {
            return devices
        }
        val deviceUuids = devices.map { it.deviceUuid }
        val sensorsByDeviceUuid = sensorsByDeviceUuid(deviceUuids)
        val streamsByDeviceUuid = streamsByDeviceUuid(deviceUuids)
        return devices.map { device ->
            device.copy(
                sensors = RegisteredDeviceSensors(sensorsByDeviceUuid[device.deviceUuid].orEmpty()),
                streamPaths = RegisteredDeviceStreams(streamsByDeviceUuid[device.deviceUuid].orEmpty()),
            )
        }
    }

    fun replace(device: RegisteredDevice) {
        replaceSensors(device)
        replaceStreams(device)
    }

    private fun sensorsByDeviceUuid(deviceUuids: List<String>): Map<String, List<RegisteredDeviceSensor>> =
        jdbc.query(
            RegisteredDeviceMetadataSql.selectSensorsForDevices(deviceUuids.size),
            sensorRowMapper,
            *deviceUuids.toTypedArray(),
        ).groupBy { it.deviceUuid }
            .mapValues { (_, rows) -> rows.map { it.sensor } }

    private fun streamsByDeviceUuid(deviceUuids: List<String>): Map<String, List<RegisteredDeviceStream>> =
        jdbc.query(
            RegisteredDeviceMetadataSql.selectStreamsForDevices(deviceUuids.size),
            streamRowMapper,
            *deviceUuids.toTypedArray(),
        ).groupBy { it.deviceUuid }
            .mapValues { (_, rows) -> rows.map { it.stream } }

    private fun replaceSensors(device: RegisteredDevice) {
        jdbc.update(RegisteredDeviceMetadataSql.deleteSensors, device.deviceUuid)
        jdbc.batchUpdate(
            RegisteredDeviceMetadataSql.insertSensor,
            device.sensors.values.map {
                arrayOf(device.deviceUuid, it.sensorId, it.sensorType, it.status)
            },
        )
    }

    private fun replaceStreams(device: RegisteredDevice) {
        jdbc.update(RegisteredDeviceMetadataSql.deleteStreams, device.deviceUuid)
        jdbc.batchUpdate(
            RegisteredDeviceMetadataSql.insertStream,
            device.streamPaths.values.map {
                arrayOf(device.deviceUuid, it.streamPath, it.kind, it.status)
            },
        )
    }

    private companion object {
        val sensorRowMapper = RowMapper<DeviceSensorRow> { rs, _ ->
            DeviceSensorRow(
                deviceUuid = rs.getString(RegisteredDeviceMetadataColumns.deviceUuid),
                sensor = RegisteredDeviceSensor(
                    sensorId = rs.getString(RegisteredDeviceMetadataColumns.sensorId),
                    sensorType = rs.getString(RegisteredDeviceMetadataColumns.sensorType),
                    status = rs.getString(RegisteredDeviceMetadataColumns.status),
                ),
            )
        }
        val streamRowMapper = RowMapper<DeviceStreamRow> { rs, _ ->
            DeviceStreamRow(
                deviceUuid = rs.getString(RegisteredDeviceMetadataColumns.deviceUuid),
                stream = RegisteredDeviceStream(
                    streamPath = rs.getString(RegisteredDeviceMetadataColumns.streamPath),
                    kind = rs.getString(RegisteredDeviceMetadataColumns.kind),
                    status = rs.getString(RegisteredDeviceMetadataColumns.status),
                ),
            )
        }
    }
}

private data class DeviceSensorRow(
    val deviceUuid: String,
    val sensor: RegisteredDeviceSensor,
)

private data class DeviceStreamRow(
    val deviceUuid: String,
    val stream: RegisteredDeviceStream,
)

private object RegisteredDeviceMetadataColumns {
    const val deviceUuid = "device_uuid"
    const val status = "status"
    const val sensorId = "sensor_id"
    const val sensorType = "sensor_type"
    const val streamPath = "stream_path"
    const val kind = "kind"
}

private object RegisteredDeviceMetadataSql {
    const val deleteSensors = "DELETE FROM registered_device_sensors WHERE device_uuid = ?"
    const val insertSensor = """
        INSERT INTO registered_device_sensors (device_uuid, sensor_id, sensor_type, status)
        VALUES (?, ?, ?, ?)
    """
    const val deleteStreams = "DELETE FROM registered_device_streams WHERE device_uuid = ?"
    const val insertStream = """
        INSERT INTO registered_device_streams (device_uuid, stream_path, kind, status)
        VALUES (?, ?, ?, ?)
    """

    fun selectSensorsForDevices(count: Int): String = """
        SELECT device_uuid, sensor_id, sensor_type, status
        FROM registered_device_sensors
        WHERE device_uuid IN (${placeholders(count)})
        ORDER BY device_uuid ASC, sensor_id ASC
    """

    fun selectStreamsForDevices(count: Int): String = """
        SELECT device_uuid, stream_path, kind, status
        FROM registered_device_streams
        WHERE device_uuid IN (${placeholders(count)})
        ORDER BY device_uuid ASC, stream_path ASC
    """

    private fun placeholders(count: Int): String =
        List(count) { "?" }.joinToString(", ")
}
