package kr.co.a4ai.gcssaker.authpolicy.domain

interface RegisteredDeviceRepository {
    fun list(): List<RegisteredDevice>
    fun findByDeviceUuid(deviceUuid: String): RegisteredDevice?
    fun save(device: RegisteredDevice): RegisteredDevice
}
