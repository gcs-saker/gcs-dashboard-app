package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kotlin.test.Test
import kotlin.test.assertEquals

class GroupAdministrationHealthIndicatorTest {
    @Test
    fun `reports active groups without exactly one administrator`() {
        val group = OrganizationUnit(GroupId("co-a"), "Company", GroupType.COMPANY)
        val users = InMemoryAuthUserRepository(emptyList())
        val indicator = GroupAdministrationHealthIndicator(InMemoryOrganizationHierarchyRepository(listOf(group)), users)

        val health = indicator.health()

        assertEquals("warning", health.details["coverage"])
        assertEquals(1, health.details["uncoveredGroupCount"])
    }

    @Test
    fun `reports complete coverage for one active administrator`() {
        val group = OrganizationUnit(GroupId("co-a"), "Company", GroupType.COMPANY)
        val users = InMemoryAuthUserRepository(
            listOf(AuthUser(username = "admin-a", email = "admin@test", passwordHash = "hash", role = UserRole.GROUP_ADMIN, groupId = group.id)),
        )
        val indicator = GroupAdministrationHealthIndicator(InMemoryOrganizationHierarchyRepository(listOf(group)), users)

        assertEquals("complete", indicator.health().details["coverage"])
    }
}
