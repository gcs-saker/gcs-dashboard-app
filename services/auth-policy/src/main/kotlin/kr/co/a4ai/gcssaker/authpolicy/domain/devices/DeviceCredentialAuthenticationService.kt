package kr.co.a4ai.gcssaker.authpolicy.domain

class DeviceCredentialAuthenticationService(
    private val devices: RegisteredDeviceRepository,
    private val passwordHasher: PasswordHasher,
    private val hierarchy: OrganizationHierarchyRepository? = null,
) {
    fun authenticate(deviceUuid: String, credential: String): RegisteredDevice {
        val device = devices.findByDeviceUuid(deviceUuid)
            ?: throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        if (device.status != RegisteredDeviceStatus.ACTIVE) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.DEVICE_INACTIVE)
        }
        validateGroup(device)
        if (!passwordHasher.verify(credential, device.credentialHash)) {
            throw DevicePublishAuthorizationRejectedException(DevicePublishAuthorizationReasons.AUTHENTICATION_FAILED)
        }
        return device
    }

    fun validateBinding(deviceUuid: String, expected: DevicePolicyBinding): RegisteredDevice {
        val device = devices.findByDeviceUuid(deviceUuid)
            ?: throw DevicePublishAuthorizationRejectedException("device_binding_invalid")
        if (device.status != RegisteredDeviceStatus.ACTIVE || device.groupId != expected.groupId ||
            device.credentialVersion != expected.credentialVersion || device.policyVersion != expected.policyVersion
        ) throw DevicePublishAuthorizationRejectedException("device_binding_invalid")
        validateGroup(device)
        return device
    }

    private fun validateGroup(device: RegisteredDevice) {
        val groups = hierarchy?.current()?.units() ?: return
        if (groups.none { it.id == device.groupId && it.status == GroupStatus.ACTIVE }) {
            throw DevicePublishAuthorizationRejectedException("device_group_inactive")
        }
    }
}

data class DevicePolicyBinding(val groupId: GroupId, val credentialVersion: Long, val policyVersion: Long)
