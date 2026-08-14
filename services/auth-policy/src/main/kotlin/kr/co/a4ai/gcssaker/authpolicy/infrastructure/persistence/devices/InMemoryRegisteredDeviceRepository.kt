package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices

import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository

class InMemoryRegisteredDeviceRepository(
    initialDevices: Collection<RegisteredDevice> = emptyList(),
) : RegisteredDeviceRepository {
    private val devicesByUuid = initialDevices.associateBy { it.deviceUuid }.toMutableMap()

    override fun list(): List<RegisteredDevice> = devicesByUuid.values.sortedBy { it.deviceUuid }

    override fun findByDeviceUuid(deviceUuid: String): RegisteredDevice? = devicesByUuid[deviceUuid]

    @Synchronized
    override fun save(device: RegisteredDevice): RegisteredDevice {
        devicesByUuid[device.deviceUuid] = device
        return device
    }
}
