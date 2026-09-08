package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

data class RegisterDeviceCommand(
    val groupId: String,
    val displayName: String,
    val deviceType: String? = null,
    val sensors: List<RegisteredDeviceSensor> = emptyList(),
    val streamPaths: List<RegisteredDeviceStream> = emptyList(),
)

data class UpdateDeviceCommand(
    val groupId: String? = null,
    val displayName: String? = null,
    val status: String? = null,
    val deviceType: String? = null,
    val sensors: List<RegisteredDeviceSensor>? = null,
    val streamPaths: List<RegisteredDeviceStream>? = null,
)

data class DeviceCredentialIssue(
    val device: RegisteredDevice,
    val credential: String,
)

class DeviceNotFoundException(deviceUuid: String) : RuntimeException("device not found: $deviceUuid")

class DeviceCredentialGenerator(
    private val random: SecureRandom = SecureRandom(),
) {
    fun generate(): String {
        val bytes = ByteArray(DeviceCredentialContract.BYTE_LENGTH)
        random.nextBytes(bytes)
        return DeviceCredentialContract.PREFIX +
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}

object DeviceCredentialContract {
    const val PREFIX = "gcs_dev_"
    const val BYTE_LENGTH = 32
}

class DeviceLifecycleService(
    private val devices: RegisteredDeviceRepository,
    private val passwordHasher: PasswordHasher,
    private val credentialGenerator: DeviceCredentialGenerator = DeviceCredentialGenerator(),
    private val uuidGenerator: () -> String = { UUID.randomUUID().toString() },
) {
    fun list(limit: Int = 200, offset: Int = 0): List<RegisteredDevice> = devices.list(limit, offset)

    fun listByGroup(groupId: GroupId, limit: Int = 200, offset: Int = 0): List<RegisteredDevice> =
        devices.listByGroup(groupId, limit, offset)

    fun get(deviceUuid: String): RegisteredDevice =
        devices.findByDeviceUuid(deviceUuid) ?: throw DeviceNotFoundException(deviceUuid)

    fun register(command: RegisterDeviceCommand): DeviceCredentialIssue {
        val deviceUuid = uniqueDeviceUuid()
        val credential = credentialGenerator.generate()
        val streams = if (command.streamPaths.isEmpty()) {
            canonicalStreams(deviceUuid, command.sensors)
        } else {
            RegisteredDeviceStreams(command.streamPaths)
        }
        val device = RegisteredDevice(
            deviceUuid = deviceUuid,
            groupId = GroupId(command.groupId),
            displayName = command.displayName,
            credentialHash = passwordHasher.hash(credential),
            status = RegisteredDeviceStatus.PENDING,
            deviceType = command.deviceType?.let(::parseDeviceType) ?: DeviceType.DRONE,
            sensors = RegisteredDeviceSensors(command.sensors),
            streamPaths = streams,
        )
        return DeviceCredentialIssue(devices.save(device), credential)
    }

    private fun uniqueDeviceUuid(): String {
        repeat(DeviceLifecycleContract.UUID_GENERATION_ATTEMPTS) {
            val deviceUuid = uuidGenerator()
            if (devices.findByDeviceUuid(deviceUuid) == null) {
                return deviceUuid
            }
        }
        error(DeviceLifecycleContract.UUID_GENERATION_FAILED)
    }

    fun activate(deviceUuid: String): RegisteredDevice =
        updateStatus(deviceUuid, RegisteredDeviceStatus.ACTIVE)

    fun disable(deviceUuid: String): RegisteredDevice =
        updateStatus(deviceUuid, RegisteredDeviceStatus.DISABLED)

    fun rotateCredential(deviceUuid: String): DeviceCredentialIssue {
        val device = get(deviceUuid)
        val credential = credentialGenerator.generate()
        val updated = devices.save(
            device.copy(
                credentialHash = passwordHasher.hash(credential),
                credentialVersion = device.credentialVersion + 1,
                policyVersion = device.policyVersion + 1,
            ),
        )
        return DeviceCredentialIssue(updated, credential)
    }

    fun update(deviceUuid: String, command: UpdateDeviceCommand): RegisteredDevice {
        val current = get(deviceUuid)
        val updatedSensors = command.sensors?.let(::RegisteredDeviceSensors) ?: current.sensors
        val updatedStreams = command.streamPaths?.let(::RegisteredDeviceStreams)
            ?: if (command.sensors != null) canonicalStreams(current.deviceUuid, updatedSensors.values) else current.streamPaths
        val updatedStatus = command.status?.let(::parseStatus) ?: current.status
        requireActiveSensor(updatedStatus, updatedSensors)
        return devices.save(
            current.copy(
                groupId = command.groupId?.let(::GroupId) ?: current.groupId,
                displayName = command.displayName ?: current.displayName,
                status = updatedStatus,
                deviceType = command.deviceType?.let(::parseDeviceType) ?: current.deviceType,
                sensors = updatedSensors,
                streamPaths = updatedStreams,
                policyVersion = current.policyVersion + 1,
            ),
        )
    }

    private fun updateStatus(deviceUuid: String, status: RegisteredDeviceStatus): RegisteredDevice {
        val device = get(deviceUuid)
        requireActiveSensor(status, device.sensors)
        return devices.save(device.copy(status = status, policyVersion = device.policyVersion + 1))
    }

    private fun requireActiveSensor(status: RegisteredDeviceStatus, sensors: RegisteredDeviceSensors) {
        if (status != RegisteredDeviceStatus.ACTIVE) return
        require(sensors.values.any { sensor ->
            sensor.status.equals(DeviceRegistryDefaults.ACTIVE_STATUS, ignoreCase = true)
        }) { DeviceLifecycleContract.ACTIVE_SENSOR_REQUIRED }
    }

    private fun canonicalStreams(deviceUuid: String, sensors: List<RegisteredDeviceSensor>): RegisteredDeviceStreams =
        RegisteredDeviceStreams(
            sensors.map { sensor ->
                RegisteredDeviceStream(
                    streamPath = RegisteredDeviceStreamIdentity.from(deviceUuid, sensor.sensorId).path,
                    status = sensor.status,
                )
            },
        )

    private fun parseStatus(status: String): RegisteredDeviceStatus =
        RegisteredDeviceStatus.entries.firstOrNull { it.name.equals(status, ignoreCase = true) }
            ?: throw IllegalArgumentException(DeviceLifecycleContract.INVALID_DEVICE_STATUS)

    private fun parseDeviceType(deviceType: String): DeviceType =
        DeviceType.parse(deviceType)
            ?: throw IllegalArgumentException(DeviceLifecycleContract.INVALID_DEVICE_TYPE)
}

object DeviceLifecycleContract {
    const val UUID_GENERATION_ATTEMPTS = 3
    const val UUID_GENERATION_FAILED = "device uuid generation failed"
    const val INVALID_DEVICE_STATUS = "invalid device status"
    const val INVALID_DEVICE_TYPE = "invalid device type"
    const val ACTIVE_SENSOR_REQUIRED = "active device requires at least one active sensor"
}
