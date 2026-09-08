package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.MessageDigest

data class DeviceBootstrapCommand(
    val provisioningToken: String,
    val displayName: String,
    val deviceType: String? = null,
    val sensors: List<RegisteredDeviceSensor> = emptyList(),
    val streamPaths: List<RegisteredDeviceStream> = emptyList(),
)

data class DeviceBootstrapToken(
    val token: String,
    val groupId: GroupId,
) {
    init {
        require(token.isNotBlank()) { DeviceBootstrapContract.TOKEN_REQUIRED }
    }
}

class DeviceBootstrapTokens private constructor(
    private val values: List<DeviceBootstrapToken>,
) {
    fun groupIdFor(provisioningToken: String): GroupId? {
        val candidate = provisioningToken.trim().toByteArray()
        return values.firstOrNull { entry ->
            MessageDigest.isEqual(entry.token.toByteArray(), candidate)
        }?.groupId
    }

    companion object {
        fun of(values: Collection<DeviceBootstrapToken>): DeviceBootstrapTokens =
            DeviceBootstrapTokens(values.toList())

        fun empty(): DeviceBootstrapTokens = DeviceBootstrapTokens(emptyList())
    }
}

class DeviceBootstrapRejectedException : RuntimeException(DeviceBootstrapContract.INVALID_PROVISIONING_TOKEN)

class DeviceBootstrapService(
    private val lifecycle: DeviceLifecycleService,
    private val tokens: DeviceBootstrapTokens,
    private val provisioningTokens: DeviceProvisioningTokenService? = null,
) {
    fun bootstrap(command: DeviceBootstrapCommand): DeviceCredentialIssue {
        val groupId = provisioningTokens?.consume(command.provisioningToken)
            ?: tokens.groupIdFor(command.provisioningToken)
            ?: throw DeviceBootstrapRejectedException()
        return lifecycle.register(
            RegisterDeviceCommand(
                groupId = groupId.value,
                displayName = command.displayName,
                deviceType = command.deviceType,
                sensors = command.sensors,
                // A device may report capabilities, but it cannot authorize its own publish destinations.
                // Canonical stream paths are assigned by an administrator when the pending device is approved.
                streamPaths = emptyList(),
            ),
        )
    }
}

object DeviceBootstrapContract {
    const val TOKEN_REQUIRED = "device bootstrap token must not be blank"
    const val INVALID_PROVISIONING_TOKEN = "invalid device provisioning token"
}
