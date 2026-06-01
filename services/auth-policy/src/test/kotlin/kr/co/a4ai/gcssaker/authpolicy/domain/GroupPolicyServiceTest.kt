package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GroupPolicyServiceTest {
    private val battalion = OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION)
    private val companyA = OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, battalion.id)
    private val companyB = OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, battalion.id)
    private val service = GroupPolicyService(listOf(battalion, companyA, companyB))

    @Test
    fun `viewer can view stream in same group`() {
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-a/drone-1"), companyA.id, Instant.EPOCH)

        val decision = service.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("same group stream", decision.reason)
    }

    @Test
    fun `operator can view descendant group stream`() {
        val principal = AuthenticatedPrincipal("op-bn", UserRole.OPERATOR, battalion.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, Instant.EPOCH)

        val decision = service.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("operator can view descendant group stream", decision.reason)
    }

    @Test
    fun `viewer cannot view sibling group stream`() {
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, Instant.EPOCH)

        val decision = service.canViewStream(principal, stream)

        assertFalse(decision.allowed)
        assertEquals("stream is outside principal group scope", decision.reason)
    }

    @Test
    fun `admin can view every stream`() {
        val principal = AuthenticatedPrincipal("admin", UserRole.ADMIN, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, Instant.EPOCH)

        assertTrue(service.canViewStream(principal, stream).allowed)
    }

    @Test
    fun `role permissions are explicit`() {
        assertEquals(setOf(Permission.VIEW_STREAM), service.permissionsFor(UserRole.VIEWER))
        assertTrue(Permission.MANAGE_POLICY in service.permissionsFor(UserRole.ADMIN))
    }
}
