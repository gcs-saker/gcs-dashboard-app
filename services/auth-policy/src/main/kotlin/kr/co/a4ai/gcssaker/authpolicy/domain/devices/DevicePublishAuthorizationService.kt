package kr.co.a4ai.gcssaker.authpolicy.domain

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
