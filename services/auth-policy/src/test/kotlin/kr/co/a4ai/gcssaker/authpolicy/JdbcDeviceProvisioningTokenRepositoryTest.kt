package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenRecord
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceProvisioningTokenStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcDeviceProvisioningTokenRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import org.h2.jdbcx.JdbcDataSource
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JdbcDeviceProvisioningTokenRepositoryTest {
    @Test
    fun `jdbc repository stores and consumes provisioning token atomically`() {
        val dataSource = h2DataSource()
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY)),
        )
        val repository = JdbcDeviceProvisioningTokenRepository(dataSource)

        repository.save(ProvisioningTokenRepositoryFixtures.record())

        assertEquals(1, repository.activeCandidates(ProvisioningTokenRepositoryFixtures.NOW).size)
        assertTrue(repository.consume(ProvisioningTokenRepositoryFixtures.TOKEN_ID, ProvisioningTokenRepositoryFixtures.NOW))
        assertEquals(DeviceProvisioningTokenStatus.EXHAUSTED, repository.list().single().status)
        assertEquals(0, repository.activeCandidates(ProvisioningTokenRepositoryFixtures.NOW).size)
    }

    private fun h2DataSource(): JdbcDataSource =
        JdbcDataSource().apply {
            setURL("jdbc:h2:mem:provisioning_token_${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
            user = "sa"
            password = ""
        }
}

private object ProvisioningTokenRepositoryFixtures {
    const val TOKEN_ID = "provisioning-token-001"
    val NOW: Instant = Instant.parse("2026-07-20T01:00:00Z")

    fun record(): DeviceProvisioningTokenRecord =
        DeviceProvisioningTokenRecord(
            tokenId = TOKEN_ID,
            tokenHash = "hash",
            groupId = GroupId("co-a"),
            label = "Daegu field bootstrap",
            status = DeviceProvisioningTokenStatus.ACTIVE,
            maxUses = 1,
            usedCount = 0,
            expiresAt = NOW.plusSeconds(3600),
            createdBy = "admin01",
            createdAt = NOW,
        )
}
