package kr.co.a4ai.gcssaker.authpolicy.domain

enum class RegisteredDeviceStatus {
    ACTIVE,
    PENDING,
    DISABLED,
}

enum class DeviceType(
    val apiValue: String,
    private val aliases: Set<String> = emptySet(),
) {
    ROBOT("robot", setOf("ugv", "rover", "ground-robot", "ground_robot")),
    DRONE("drone", setOf("uav", "uas")),
    CAMERA("camera", setOf("webcam", "cctv", "ip-camera", "ip_camera")),
    MIC("mic", setOf("microphone")),
    PHONE("phone", setOf("mobile", "smartphone")),
    EDGE_GATEWAY("edge-gateway", setOf("edge_gateway", "gateway")),
    ;

    fun matches(raw: String): Boolean {
        val normalized = raw.trim().lowercase()
        return normalized == apiValue ||
            normalized == name.lowercase() ||
            normalized in aliases
    }

    companion object {
        fun parse(raw: String): DeviceType? =
            entries.firstOrNull { it.matches(raw) }
    }
}

data class RegisteredDeviceSensor(
    val sensorId: String,
    val sensorType: String,
    val status: String = DeviceRegistryDefaults.ACTIVE_STATUS,
) {
    init {
        require(sensorId.isNotBlank()) { DeviceRegistryErrors.SENSOR_ID_REQUIRED }
        require(sensorType.isNotBlank()) { DeviceRegistryErrors.SENSOR_TYPE_REQUIRED }
        require(status.isNotBlank()) { DeviceRegistryErrors.SENSOR_STATUS_REQUIRED }
    }
}

data class RegisteredDeviceStream(
    val streamPath: String,
    val kind: String = DeviceRegistryDefaults.WEBRTC_KIND,
    val status: String = DeviceRegistryDefaults.ACTIVE_STATUS,
) {
    init {
        require(streamPath.isNotBlank()) { DeviceRegistryErrors.STREAM_PATH_REQUIRED }
        require(kind.isNotBlank()) { DeviceRegistryErrors.STREAM_KIND_REQUIRED }
        require(status.isNotBlank()) { DeviceRegistryErrors.STREAM_STATUS_REQUIRED }
    }
}

data class RegisteredDeviceSensors(
    val values: List<RegisteredDeviceSensor>,
) {
    companion object {
        fun empty(): RegisteredDeviceSensors = RegisteredDeviceSensors(emptyList())
    }
}

data class RegisteredDeviceStreams(
    val values: List<RegisteredDeviceStream>,
) {
    companion object {
        fun empty(): RegisteredDeviceStreams = RegisteredDeviceStreams(emptyList())
    }
}

data class RegisteredDevice(
    val deviceUuid: String,
    val groupId: GroupId,
    val displayName: String,
    val credentialHash: String,
    val status: RegisteredDeviceStatus = RegisteredDeviceStatus.PENDING,
    val deviceType: DeviceType = DeviceType.DRONE,
    val sensors: RegisteredDeviceSensors = RegisteredDeviceSensors.empty(),
    val streamPaths: RegisteredDeviceStreams = RegisteredDeviceStreams.empty(),
    val credentialVersion: Long = 1,
    val policyVersion: Long = 1,
) {
    init {
        require(deviceUuid.isNotBlank()) { "device uuid must not be blank" }
        require(displayName.isNotBlank()) { "device display name must not be blank" }
        require(credentialHash.isNotBlank()) { "device credential hash must not be blank" }
    }
}

object DeviceRegistryDefaults {
    const val ACTIVE_STATUS = "active"
    const val WEBRTC_KIND = "webrtc"
}

object DeviceRegistryErrors {
    const val SENSOR_ID_REQUIRED = "sensor id must not be blank"
    const val SENSOR_TYPE_REQUIRED = "sensor type must not be blank"
    const val SENSOR_STATUS_REQUIRED = "sensor status must not be blank"
    const val STREAM_PATH_REQUIRED = "stream path must not be blank"
    const val STREAM_KIND_REQUIRED = "stream kind must not be blank"
    const val STREAM_STATUS_REQUIRED = "stream status must not be blank"
}

interface RegisteredDeviceRepository {
    fun list(): List<RegisteredDevice>
    fun findByDeviceUuid(deviceUuid: String): RegisteredDevice?
    fun save(device: RegisteredDevice): RegisteredDevice
}

class InMemoryRegisteredDeviceRepository(
    initialDevices: Collection<RegisteredDevice> = emptyList(),
) : RegisteredDeviceRepository {
    private val devicesByUuid = initialDevices.associateBy { it.deviceUuid }.toMutableMap()

    override fun list(): List<RegisteredDevice> =
        devicesByUuid.values.sortedBy { it.deviceUuid }

    override fun findByDeviceUuid(deviceUuid: String): RegisteredDevice? =
        devicesByUuid[deviceUuid]

    @Synchronized
    override fun save(device: RegisteredDevice): RegisteredDevice {
        devicesByUuid[device.deviceUuid] = device
        return device
    }
}

data class DevicePublishAuthorizationCommand(
    val deviceUuid: String,
    val credential: String,
    val sensorId: String,
)

data class DevicePublishAuthorization(
    val deviceUuid: String,
    val streamId: String,
    val path: String,
    val sensorId: String,
    val publisherGroupId: GroupId,
    val credentialVersion: Long,
    val devicePolicyVersion: Long,
    val reason: String,
)

class DevicePublishAuthorizationRejectedException(message: String) : RuntimeException(message)

class DeviceCredentialAuthenticationService(
    private val devices: RegisteredDeviceRepository,
    private val passwordHasher: PasswordHasher,
) {
    fun authenticate(deviceUuid: String, credential: String): RegisteredDevice {
        val device = devices.findByDeviceUuid(deviceUuid)
            ?: throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        if (device.status != RegisteredDeviceStatus.ACTIVE) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.DEVICE_INACTIVE)
        }
        if (!passwordHasher.verify(credential, device.credentialHash)) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        }
        return device
    }
}

class DevicePublishAuthorizationService(
    private val deviceCredentials: DeviceCredentialAuthenticationService,
) {
    constructor(devices: RegisteredDeviceRepository, passwordHasher: PasswordHasher) :
        this(DeviceCredentialAuthenticationService(devices, passwordHasher))

    fun authorize(command: DevicePublishAuthorizationCommand): DevicePublishAuthorization {
        val device = deviceCredentials.authenticate(command.deviceUuid, command.credential)
        val sensor = resolveActiveSensor(device, command.sensorId)
        val identity = RegisteredDeviceStreamIdentity.from(device.deviceUuid, sensor.sensorId)
        require(device.streamPaths.values.isEmpty() || device.streamPaths.values.any {
            it.status.equals(DeviceRegistryDefaults.ACTIVE_STATUS, ignoreCase = true) &&
                StreamPath(it.streamPath).value == identity.path
        }) { DevicePublishAuthorizationReasons.STREAM_NOT_AUTHORIZED }
        return DevicePublishAuthorization(
            deviceUuid = device.deviceUuid,
            streamId = identity.streamId,
            path = identity.path,
            sensorId = sensor.sensorId,
            publisherGroupId = device.groupId,
            credentialVersion = device.credentialVersion,
            devicePolicyVersion = device.policyVersion,
            reason = DevicePublishAuthorizationReasons.DEVICE_GROUP_AUTHORIZED,
        )
    }

    private fun resolveActiveSensor(device: RegisteredDevice, requestedSensorId: String): RegisteredDeviceSensor {
        val active = device.sensors.values.filter {
            it.status.equals(DeviceRegistryDefaults.ACTIVE_STATUS, ignoreCase = true)
        }
        require(active.isNotEmpty()) { DevicePublishAuthorizationReasons.SENSOR_NOT_AUTHORIZED }
        if (requestedSensorId.isBlank()) {
            require(active.size == 1) { DevicePublishAuthorizationReasons.SENSOR_ID_REQUIRED }
            return active.single()
        }
        return active.firstOrNull { it.sensorId == requestedSensorId.trim() }
            ?: throw IllegalArgumentException(DevicePublishAuthorizationReasons.SENSOR_NOT_AUTHORIZED)
    }
}

data class RegisteredDeviceStreamIdentity(val streamId: String, val path: String) {
    companion object {
        fun from(deviceUuid: String, sensorId: String): RegisteredDeviceStreamIdentity {
            val safeDevice = canonicalSegment(deviceUuid, "device uuid")
            val safeSensor = canonicalSegment(sensorId, "sensor id")
            return RegisteredDeviceStreamIdentity(
                streamId = "raw.$safeDevice.$safeSensor",
                path = "raw/$safeDevice/$safeSensor",
            )
        }

        private fun canonicalSegment(value: String, label: String): String {
            val normalized = value.trim().lowercase()
            require(normalized.matches(Regex("[a-z0-9][a-z0-9_-]{0,127}"))) { "$label is invalid" }
            return normalized
        }
    }
}

object DevicePublishAuthorizationReasons {
    const val DEVICE_GROUP_AUTHORIZED = "device group authorized"
    const val AUTHENTICATION_FAILED = "device authentication failed"
    const val DEVICE_INACTIVE = "device is not active"
    const val SENSOR_ID_REQUIRED = "sensor id is required when multiple sensors are active"
    const val SENSOR_NOT_AUTHORIZED = "sensor is not authorized for this device"
    const val STREAM_NOT_AUTHORIZED = "stream is not authorized for this device"
}
