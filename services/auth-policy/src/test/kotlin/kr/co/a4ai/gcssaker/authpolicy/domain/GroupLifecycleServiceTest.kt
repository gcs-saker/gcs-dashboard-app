package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class GroupLifecycleServiceTest {
    private val hasher = PasswordHasher()
    private val root = OrganizationUnit(GroupId("bn-1"), "Battalion", GroupType.BATTALION)
    private val company = OrganizationUnit(GroupId("co-a"), "Company", GroupType.COMPANY, root.id)
    private val groups = InMemoryOrganizationHierarchyRepository(listOf(root, company))
    private val users = InMemoryAuthUserRepository(
        listOf(
            AuthUser(username = "system", email = "system@test", passwordHash = "hash", role = UserRole.ADMIN, groupId = root.id),
            AuthUser(username = "candidate", email = "candidate@test", passwordHash = "hash", role = UserRole.OPERATOR, groupId = root.id),
        ),
    )
    private val devices = InMemoryRegisteredDeviceRepository()
    private val service = GroupLifecycleService(groups, users, devices)
    private val principal = users.findByUsername("system")!!.principal()

    @Test
    fun `new group remains inactive until exactly one administrator is assigned`() {
        val created = service.create(
            principal,
            CreateGroupCommand(GroupId("plt-a"), "Platoon", GroupType.PLATOON, company.id),
        )
        assertEquals(GroupStatus.INACTIVE, created.status)
        assertFailsWith<IllegalArgumentException> { service.activate(principal, created.id) }

        users.replaceGroupAdmin(created.id, "candidate")
        assertEquals(GroupStatus.ACTIVE, service.activate(principal, created.id).status)
    }

    @Test
    fun `active child blocks parent deactivation`() {
        assertFailsWith<IllegalArgumentException> { service.deactivate(principal, root.id) }
    }

    @Test
    fun `moving a group invalidates member sessions`() {
        val admin = users.replaceGroupAdmin(company.id, "candidate")
        val previousVersion = admin.securityVersion

        service.update(principal, company.id, UpdateGroupCommand(parentId = null, changeParent = true))

        assertEquals(previousVersion + 1, users.findByUsername("candidate")!!.securityVersion)
    }
}
