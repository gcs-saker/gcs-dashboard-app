package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AuthCapabilityBoundaryTest {
    @Test
    fun `system administrator receives management capabilities without media capabilities`() {
        val capabilities = AuthenticatedPrincipal("admin", UserRole.ADMIN, GroupId("co-a")).toCapabilitiesResponse()

        assertTrue(capabilities.canView)
        assertTrue(capabilities.canManage)
        assertTrue(capabilities.canManageMembers)
        assertTrue(capabilities.canManageDevices)
        assertFalse(capabilities.canControl)
        assertFalse(capabilities.canSendTalkback)
        assertFalse(capabilities.canPublish)
    }
}
