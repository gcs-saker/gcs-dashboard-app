package kr.co.a4ai.gcssaker.authpolicy.domain

interface RegisteredDeviceRepository {
    fun list(limit: Int = 200, offset: Int = 0): List<RegisteredDevice>
    fun listByGroup(groupId: GroupId, limit: Int = 200, offset: Int = 0): List<RegisteredDevice>
    fun hasActiveInGroup(groupId: GroupId): Boolean
    fun findByDeviceUuid(deviceUuid: String): RegisteredDevice?
    fun save(device: RegisteredDevice): RegisteredDevice
}
