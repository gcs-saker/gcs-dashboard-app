package kr.co.a4ai.gcssaker.authpolicy.domain

enum class RegisteredDeviceStatus {
    ACTIVE, PENDING, DISABLED;

    companion object {
        fun fromPersistence(raw: String): RegisteredDeviceStatus =
            when (val normalized = raw.trim().uppercase()) {
                "INACTIVE" -> DISABLED
                else -> entries.firstOrNull { it.name == normalized }
                    ?: throw IllegalArgumentException("unsupported registered device status")
            }
    }
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
    EDGE_GATEWAY("edge-gateway", setOf("edge_gateway", "gateway"));

    fun matches(raw: String): Boolean {
        val normalized = raw.trim().lowercase()
        return normalized == apiValue || normalized == name.lowercase() || normalized in aliases
    }

    companion object {
        fun parse(raw: String): DeviceType? = entries.firstOrNull { it.matches(raw) }
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
