package kr.co.a4ai.gcssaker.authpolicy.domain

enum class RegisteredDeviceStatus {
    ACTIVE,
    PENDING,
    DISABLED,
}

data class RegisteredDevice(
    val deviceUuid: String,
    val groupId: GroupId,
    val displayName: String,
    val credentialHash: String,
    val status: RegisteredDeviceStatus = RegisteredDeviceStatus.PENDING,
) {
    init {
        require(deviceUuid.isNotBlank()) { "device uuid must not be blank" }
        require(displayName.isNotBlank()) { "device display name must not be blank" }
        require(credentialHash.isNotBlank()) { "device credential hash must not be blank" }
    }
}

interface RegisteredDeviceRepository {
    fun findByDeviceUuid(deviceUuid: String): RegisteredDevice?
    fun save(device: RegisteredDevice): RegisteredDevice
}

class InMemoryRegisteredDeviceRepository(
    initialDevices: Collection<RegisteredDevice> = emptyList(),
) : RegisteredDeviceRepository {
    private val devicesByUuid = initialDevices.associateBy { it.deviceUuid }.toMutableMap()

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
    val streamId: String,
    val path: String,
)

data class DevicePublishAuthorization(
    val deviceUuid: String,
    val streamId: String,
    val path: String,
    val publisherGroupId: GroupId,
    val reason: String,
)

class DevicePublishAuthorizationRejectedException(message: String) : RuntimeException(message)

class DevicePublishAuthorizationService(
    private val devices: RegisteredDeviceRepository,
    private val passwordHasher: PasswordHasher,
) {
    fun authorize(command: DevicePublishAuthorizationCommand): DevicePublishAuthorization {
        val device = devices.findByDeviceUuid(command.deviceUuid)
            ?: throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        if (device.status != RegisteredDeviceStatus.ACTIVE) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.DEVICE_INACTIVE)
        }
        if (!passwordHasher.verify(command.credential, device.credentialHash)) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        }
        val streamPath = StreamPath(command.path)
        require(command.streamId.isNotBlank()) { "stream id must not be blank" }
        return DevicePublishAuthorization(
            deviceUuid = device.deviceUuid,
            streamId = command.streamId,
            path = streamPath.value,
            publisherGroupId = device.groupId,
            reason = DevicePublishAuthorizationReasons.DEVICE_GROUP_AUTHORIZED,
        )
    }
}

object DevicePublishAuthorizationReasons {
    const val DEVICE_GROUP_AUTHORIZED = "device group authorized"
    const val AUTHENTICATION_FAILED = "device authentication failed"
    const val DEVICE_INACTIVE = "device is not active"
}
