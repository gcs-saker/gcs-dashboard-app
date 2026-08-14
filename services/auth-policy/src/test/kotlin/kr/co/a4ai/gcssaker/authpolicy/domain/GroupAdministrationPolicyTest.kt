package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GroupAdministrationPolicyTest {
    private val policy = GroupAdministrationPolicy()
    private val ownGroup = GroupId("company-a")
    private val childGroup = GroupId("platoon-a")

    @Test
    fun `group admin manages members only in exact group`() {
        val principal = AuthenticatedPrincipal("company-admin", UserRole.GROUP_ADMIN, ownGroup)

        assertTrue(policy.canIssueMemberRole(principal, ownGroup, UserRole.OPERATOR))
        assertTrue(policy.canIssueMemberRole(principal, ownGroup, UserRole.VIEWER))
        assertFalse(policy.canIssueMemberRole(principal, childGroup, UserRole.OPERATOR))
        assertFalse(policy.canIssueMemberRole(principal, ownGroup, UserRole.GROUP_ADMIN))
        assertFalse(policy.canIssueMemberRole(principal, ownGroup, UserRole.ADMIN))
    }

    @Test
    fun `system admin can manage any group but cannot delegate administrator roles through member invite`() {
        val principal = AuthenticatedPrincipal("system-admin", UserRole.ADMIN, ownGroup)

        assertTrue(policy.canManageGroup(principal, childGroup))
        assertTrue(policy.canIssueMemberRole(principal, childGroup, UserRole.VIEWER))
        assertFalse(policy.canIssueMemberRole(principal, childGroup, UserRole.GROUP_ADMIN))
    }
}
