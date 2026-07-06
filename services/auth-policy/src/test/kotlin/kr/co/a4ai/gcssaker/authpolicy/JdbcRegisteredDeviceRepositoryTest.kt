package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcRegisteredDeviceRepository
import org.h2.jdbcx.JdbcDataSource
import kotlin.test.Test
import kotlin.test.assertEquals

class JdbcRegisteredDeviceRepositoryTest {
    @Test
    fun `jdbc repository stores registered device credential hash and group`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcRegisteredDeviceRepository(dataSource)

        repository.save(
            RegisteredDevice(
                deviceUuid = DeviceRepositoryFixtures.DEVICE_UUID,
                groupId = GroupId("co-a"),
                displayName = "Front Drone",
                credentialHash = DeviceRepositoryFixtures.CREDENTIAL_HASH,
                status = RegisteredDeviceStatus.ACTIVE,
            ),
        )

        val saved = repository.findByDeviceUuid(DeviceRepositoryFixtures.DEVICE_UUID)
        assertEquals(DeviceRepositoryFixtures.DEVICE_UUID, saved?.deviceUuid)
        assertEquals("co-a", saved?.groupId?.value)
        assertEquals(DeviceRepositoryFixtures.CREDENTIAL_HASH, saved?.credentialHash)
        assertEquals(RegisteredDeviceStatus.ACTIVE, saved?.status)
    }

    private fun h2DataSource(): JdbcDataSource =
        JdbcDataSource().apply {
            setURL("jdbc:h2:mem:registered_device_${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
            user = "sa"
            password = ""
        }
}

private object DeviceRepositoryFixtures {
    const val DEVICE_UUID = "device-front-001"
    const val CREDENTIAL_HASH = "credential-hash"
}
