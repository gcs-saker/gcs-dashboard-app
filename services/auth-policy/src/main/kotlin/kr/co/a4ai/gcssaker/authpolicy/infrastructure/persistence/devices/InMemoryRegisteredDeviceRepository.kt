package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices

import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId

class InMemoryRegisteredDeviceRepository(
    initialDevices: Collection<RegisteredDevice> = emptyList(),
) : RegisteredDeviceRepository {
    private val devicesByUuid = initialDevices.associateBy { it.deviceUuid }.toMutableMap()

    override fun list(limit: Int, offset: Int): List<RegisteredDevice> =
        devicesByUuid.values.sortedBy { it.deviceUuid }.drop(offset).take(limit)

    override fun listByGroup(groupId: GroupId, limit: Int, offset: Int): List<RegisteredDevice> =
        devicesByUuid.values.filter { it.groupId == groupId }.sortedBy { it.deviceUuid }.drop(offset).take(limit)

    override fun hasActiveInGroup(groupId: GroupId): Boolean =
        devicesByUuid.values.any { it.groupId == groupId && it.status == RegisteredDeviceStatus.ACTIVE }

    override fun findByDeviceUuid(deviceUuid: String): RegisteredDevice? = devicesByUuid[deviceUuid]

    @Synchronized
    override fun save(device: RegisteredDevice): RegisteredDevice {
        devicesByUuid[device.deviceUuid] = device
        return device
    }
}
