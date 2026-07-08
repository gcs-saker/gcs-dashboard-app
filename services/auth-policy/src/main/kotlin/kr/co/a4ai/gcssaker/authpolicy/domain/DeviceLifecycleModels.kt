package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

data class RegisterDeviceCommand(
    val groupId: String,
    val displayName: String,
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
    fun register(command: RegisterDeviceCommand): DeviceCredentialIssue {
        val deviceUuid = uniqueDeviceUuid()
        val credential = credentialGenerator.generate()
        val device = RegisteredDevice(
            deviceUuid = deviceUuid,
            groupId = GroupId(command.groupId),
            displayName = command.displayName,
            credentialHash = passwordHasher.hash(credential),
            status = RegisteredDeviceStatus.PENDING,
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
        val device = devices.findByDeviceUuid(deviceUuid) ?: throw DeviceNotFoundException(deviceUuid)
        val credential = credentialGenerator.generate()
        val updated = devices.save(device.copy(credentialHash = passwordHasher.hash(credential)))
        return DeviceCredentialIssue(updated, credential)
    }

    private fun updateStatus(deviceUuid: String, status: RegisteredDeviceStatus): RegisteredDevice {
        val device = devices.findByDeviceUuid(deviceUuid) ?: throw DeviceNotFoundException(deviceUuid)
        return devices.save(device.copy(status = status))
    }
}

object DeviceLifecycleContract {
    const val UUID_GENERATION_ATTEMPTS = 3
    const val UUID_GENERATION_FAILED = "device uuid generation failed"
}
