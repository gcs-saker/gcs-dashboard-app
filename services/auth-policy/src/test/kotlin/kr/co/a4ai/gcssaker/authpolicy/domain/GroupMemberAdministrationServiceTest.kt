package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GroupMemberAdministrationServiceTest {
    private val groupA = GroupId("co-a")
    private val groupB = GroupId("co-b")
    private val hasher = PasswordHasher()
    private val repository = InMemoryAuthUserRepository(
        listOf(
            user("system", UserRole.ADMIN, groupA),
            user("admin-a", UserRole.GROUP_ADMIN, groupA),
            user("operator-a", UserRole.OPERATOR, groupA),
            user("viewer-a", UserRole.VIEWER, groupA),
            user("viewer-b", UserRole.VIEWER, groupB),
        ),
    )
    private val service = GroupMemberAdministrationService(repository, hasher)

    @Test
    fun `group admin lists and updates only exact group members`() {
        val principal = repository.findByUsername("admin-a")!!.principal()

        assertEquals(4, service.list(principal, groupA).size)
        assertFailsWith<IllegalArgumentException> { service.list(principal, groupB) }

        val updated = service.update(
            principal,
            groupA,
            "viewer-a",
            GroupMemberUpdate(role = UserRole.OPERATOR, active = false),
        )
        assertEquals(UserRole.OPERATOR, updated.role)
        assertFalse(updated.active)
        assertEquals(2, updated.securityVersion)
    }

    @Test
    fun `group admin cannot mutate administrator accounts`() {
        val principal = repository.findByUsername("admin-a")!!.principal()

        assertFailsWith<IllegalArgumentException> {
            service.update(principal, groupA, "admin-a", GroupMemberUpdate(active = false))
        }
    }

    @Test
    fun `system admin atomically replaces exact group administrator`() {
        val replacement = service.replaceGroupAdmin(
            repository.findByUsername("system")!!.principal(),
            groupA,
            "operator-a",
        )

        assertEquals(UserRole.GROUP_ADMIN, replacement.role)
        assertTrue(replacement.active)
        assertEquals(UserRole.OPERATOR, repository.findByUsername("admin-a")!!.role)
        assertEquals(1, repository.list().count { it.groupId == groupA && it.role == UserRole.GROUP_ADMIN && it.active })
    }

    @Test
    fun `group administrator cannot appoint another group administrator`() {
        assertFailsWith<IllegalArgumentException> {
            service.replaceGroupAdmin(
                repository.findByUsername("admin-a")!!.principal(),
                groupA,
                "operator-a",
            )
        }
    }

    private fun user(username: String, role: UserRole, groupId: GroupId) = AuthUser(
        username = username,
        email = "$username@example.test",
        passwordHash = hasher.hash("valid-password"),
        role = role,
        groupId = groupId,
    )
}
