package kr.co.a4ai.gcssaker.authpolicy.domain

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
