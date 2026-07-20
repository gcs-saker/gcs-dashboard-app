package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DeviceProvisioningTokenServiceTest {
    private val passwordHasher = PasswordHasher(iterations = 1_000)
    private val repository = InMemoryDeviceProvisioningTokenRepository()
    private val service = DeviceProvisioningTokenService(
        repository = repository,
        passwordHasher = passwordHasher,
        hierarchyRepository = DeviceProvisioningTokenFixtures.hierarchy(),
        clock = Clock.fixed(DeviceProvisioningTokenFixtures.NOW, ZoneOffset.UTC),
        tokenGenerator = DeviceProvisioningTokenGenerator(DeviceProvisioningTokenFixtures.random()),
        idGenerator = { DeviceProvisioningTokenFixtures.TOKEN_ID },
    )

    @Test
    fun `issue returns raw token once and stores only hash metadata`() {
        val issued = service.issue(DeviceProvisioningTokenFixtures.command())
        val saved = repository.list().single()

        assertEquals(DeviceProvisioningTokenFixtures.TOKEN_ID, issued.record.tokenId)
        assertTrue(issued.token.startsWith(DeviceProvisioningTokenContract.TOKEN_PREFIX))
        assertNotEquals(issued.token, saved.tokenHash)
        assertTrue(passwordHasher.verify(issued.token, saved.tokenHash))
        assertEquals(DeviceProvisioningTokenStatus.ACTIVE, saved.status)
    }

    @Test
    fun `consume returns group id once for one time token`() {
        val issued = service.issue(DeviceProvisioningTokenFixtures.command())

        assertEquals(GroupId(DeviceProvisioningTokenFixtures.GROUP_ID), service.consume(issued.token))
        assertNull(service.consume(issued.token))
        assertEquals(DeviceProvisioningTokenStatus.EXHAUSTED, repository.list().single().status)
    }

    @Test
    fun `expired token is not consumable`() {
        val expiredRepository = InMemoryDeviceProvisioningTokenRepository(
            listOf(DeviceProvisioningTokenFixtures.record(expiresAt = DeviceProvisioningTokenFixtures.PAST)),
        )
        val expiredService = DeviceProvisioningTokenService(
            repository = expiredRepository,
            passwordHasher = passwordHasher,
            clock = Clock.fixed(DeviceProvisioningTokenFixtures.NOW, ZoneOffset.UTC),
        )

        assertNull(expiredService.consume(DeviceProvisioningTokenFixtures.RAW_TOKEN))
        assertEquals(DeviceProvisioningTokenStatus.EXPIRED, expiredService.list().single().status)
    }

    @Test
    fun `issue rejects unknown group before persistence`() {
        val error = assertFailsWith<IllegalArgumentException> {
            service.issue(DeviceProvisioningTokenFixtures.command(groupId = DeviceProvisioningTokenFixtures.UNKNOWN_GROUP_ID))
        }

        assertEquals(DeviceProvisioningTokenContract.GROUP_NOT_FOUND, error.message)
        assertTrue(repository.list().isEmpty())
    }
}

private object DeviceProvisioningTokenFixtures {
    const val TOKEN_ID = "provisioning-token-001"
    const val GROUP_ID = "co-a"
    const val UNKNOWN_GROUP_ID = "ghost-group"
    const val RAW_TOKEN = "gcs_boot_fixture"
    val NOW: Instant = Instant.parse("2026-07-20T01:00:00Z")
    val PAST: Instant = Instant.parse("2026-07-20T00:00:00Z")

    fun command(groupId: String = GROUP_ID): DeviceProvisioningTokenIssueCommand =
        DeviceProvisioningTokenIssueCommand(
            groupId = groupId,
            label = "Daegu field kit",
            ttlMinutes = 60,
            maxUses = 1,
            createdBy = "admin01",
        )

    fun record(expiresAt: Instant): DeviceProvisioningTokenRecord {
        val hasher = PasswordHasher(iterations = 1_000)
        return DeviceProvisioningTokenRecord(
            tokenId = TOKEN_ID,
            tokenHash = hasher.hash(RAW_TOKEN),
            groupId = GroupId(GROUP_ID),
            label = "Expired token",
            status = DeviceProvisioningTokenStatus.ACTIVE,
            maxUses = 1,
            usedCount = 0,
            expiresAt = expiresAt,
            createdBy = "admin01",
            createdAt = PAST,
        )
    }

    fun random(): java.security.SecureRandom =
        java.security.SecureRandom.getInstance("SHA1PRNG").apply { setSeed(7L) }

    fun hierarchy(): OrganizationHierarchyRepository =
        InMemoryOrganizationHierarchyRepository(
            listOf(
                OrganizationUnit(GroupId(GROUP_ID), "A Company", GroupType.COMPANY),
            ),
        )
}
