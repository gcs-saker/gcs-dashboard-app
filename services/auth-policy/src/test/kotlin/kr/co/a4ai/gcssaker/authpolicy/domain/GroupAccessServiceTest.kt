package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class GroupAccessServiceTest {
    private val hierarchy = InMemoryOrganizationHierarchyRepository(
        listOf(
            OrganizationUnit(GroupId("battalion"), "Battalion", GroupType.BATTALION),
            OrganizationUnit(GroupId("company-a"), "Company A", GroupType.COMPANY, GroupId("battalion")),
            OrganizationUnit(GroupId("platoon-a"), "Platoon A", GroupType.PLATOON, GroupId("company-a")),
            OrganizationUnit(GroupId("company-b"), "Company B", GroupType.COMPANY, GroupId("battalion")),
        ),
    )
    private val devices = InMemoryRegisteredDeviceRepository(
        listOf(
            registeredDevice("device-a", "platoon-a"),
            registeredDevice("device-b", "company-b"),
        ),
    )
    private val service = GroupAccessService(hierarchy, devices)

    @Test
    fun `operator can control only its own group`() {
        val operator = AuthenticatedPrincipal("operator-a", UserRole.OPERATOR, GroupId("company-a"))

        assertEquals(listOf("company-a"), service.visibleGroups(operator).map { it.id.value })
        assertTrue(service.accessFor(operator, GroupId("company-a")).canControl)
        assertFalse(service.accessFor(operator, GroupId("platoon-a")).canView)
        assertFalse(service.accessFor(operator, GroupId("company-a")).canManage)
        assertFailsWith<IllegalStateException> { service.devicesFor(operator, GroupId("company-b")) }
    }

    @Test
    fun `group admin manages exact group but only operates descendants`() {
        val groupAdmin = AuthenticatedPrincipal("company-admin", UserRole.GROUP_ADMIN, GroupId("company-a"))

        assertEquals(listOf("company-a", "platoon-a"), service.visibleGroups(groupAdmin).map { it.id.value })
        assertTrue(service.accessFor(groupAdmin, GroupId("company-a")).canManage)
        assertTrue(service.accessFor(groupAdmin, GroupId("company-a")).canControl)
        assertTrue(service.accessFor(groupAdmin, GroupId("platoon-a")).canView)
        assertTrue(service.accessFor(groupAdmin, GroupId("platoon-a")).canSendTalkback)
        assertFalse(service.accessFor(groupAdmin, GroupId("platoon-a")).canManage)
        assertFalse(service.accessFor(groupAdmin, GroupId("platoon-a")).canControl)
        assertFalse(service.accessFor(groupAdmin, GroupId("company-b")).canView)
    }

    @Test
    fun `viewer has read-only access to its own group`() {
        val viewer = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, GroupId("company-a"))

        val access = service.accessFor(viewer, GroupId("company-a"))
        assertTrue(access.canView)
        assertFalse(access.canControl)
        assertFalse(access.canManage)
        assertFalse(access.canSendTalkback)
        assertFailsWith<IllegalStateException> { service.devicesFor(viewer, GroupId("platoon-a")) }
    }

    @Test
    fun `admin can inspect every group`() {
        val admin = AuthenticatedPrincipal("admin", UserRole.ADMIN, GroupId("company-a"))

        assertEquals(4, service.visibleGroups(admin).size)
        assertTrue(service.accessFor(admin, GroupId("company-b")).canControl)
        assertTrue(service.accessFor(admin, GroupId("company-b")).canManage)
    }

    private fun registeredDevice(deviceUuid: String, groupId: String) = RegisteredDevice(
        deviceUuid = deviceUuid,
        groupId = GroupId(groupId),
        displayName = deviceUuid,
        credentialHash = "hash",
        status = RegisteredDeviceStatus.ACTIVE,
        deviceType = DeviceType.ROBOT,
    )
}
