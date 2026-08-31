package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GroupPolicyServiceTest {
    private val now = Instant.parse("2026-05-29T12:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val battalion = OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION)
    private val companyA = OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, battalion.id)
    private val companyB = OrganizationUnit(GroupId("co-b"), "B Company", GroupType.COMPANY, battalion.id)
    private val platoonB1 = OrganizationUnit(GroupId("plt-b-1"), "B Company 1 Platoon", GroupType.PLATOON, companyB.id)
    private val groups = listOf(battalion, companyA, companyB, platoonB1)
    private val service = GroupPolicyService(groups, clock = clock)

    @Test
    fun `viewer can view stream in same group`() {
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-a/drone-1"), companyA.id, Instant.EPOCH)

        val decision = service.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("same group stream", decision.reason)
    }

    @Test
    fun `group admin can view descendant group stream`() {
        val principal = AuthenticatedPrincipal("admin-bn", UserRole.GROUP_ADMIN, battalion.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, Instant.EPOCH)

        val decision = service.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("group admin can view descendant group stream", decision.reason)
    }

    @Test
    fun `operator cannot inherit descendant stream access`() {
        val principal = AuthenticatedPrincipal("op-bn", UserRole.OPERATOR, battalion.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, Instant.EPOCH)

        assertFalse(service.canViewStream(principal, stream).allowed)
    }

    @Test
    fun `group admin can send talkback to descendant group`() {
        val principal = AuthenticatedPrincipal("admin-bn", UserRole.GROUP_ADMIN, battalion.id)

        assertTrue(service.canSendTalkback(principal, companyB.id).allowed)
        assertTrue(service.canSendTalkback(principal, platoonB1.id).allowed)
    }

    @Test
    fun `operator cannot send talkback to descendant group`() {
        val principal = AuthenticatedPrincipal("op-bn", UserRole.OPERATOR, battalion.id)

        assertFalse(service.canSendTalkback(principal, companyB.id).allowed)
    }

    @Test
    fun `viewer cannot send talkback even inside same group`() {
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)

        assertFalse(service.canSendTalkback(principal, companyA.id).allowed)
    }

    @Test
    fun `group admin cannot send talkback to sibling or ancestor group`() {
        val principal = AuthenticatedPrincipal("admin-a", UserRole.GROUP_ADMIN, companyA.id)

        assertFalse(service.canSendTalkback(principal, companyB.id).allowed)
        assertFalse(service.canSendTalkback(principal, battalion.id).allowed)
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
        assertTrue(Permission.MANAGE_GROUP_MEMBERS in service.permissionsFor(UserRole.GROUP_ADMIN))
        assertFalse(Permission.MANAGE_POLICY in service.permissionsFor(UserRole.GROUP_ADMIN))
        assertTrue(Permission.SEND_TALKBACK in service.permissionsFor(UserRole.GROUP_ADMIN))
        assertTrue(Permission.MANAGE_POLICY in service.permissionsFor(UserRole.ADMIN))
    }

    @Test
    fun `active cross group route policy allows sibling group stream`() {
        val policyService = GroupPolicyService(
            groups = groups,
            routePolicies = StreamRoutePolicies.of(
                listOf(
                StreamRoutePolicy(
                    viewerGroupId = companyA.id,
                    publisherGroupId = companyB.id,
                    scope = StreamRouteScope.CROSS_GROUP,
                    expiresAt = now.plusSeconds(300),
                ),
                ),
            ),
            clock = clock,
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, now)

        val decision = policyService.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("active cross-group route policy", decision.reason)
    }

    @Test
    fun `expired cross group route policy does not allow sibling group stream`() {
        val policyService = GroupPolicyService(
            groups = groups,
            routePolicies = StreamRoutePolicies.of(
                listOf(
                StreamRoutePolicy(
                    viewerGroupId = companyA.id,
                    publisherGroupId = companyB.id,
                    scope = StreamRouteScope.CROSS_GROUP,
                    expiresAt = now.minusSeconds(1),
                ),
                ),
            ),
            clock = clock,
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/drone-1"), companyB.id, now)

        val decision = policyService.canViewStream(principal, stream)

        assertFalse(decision.allowed)
        assertEquals("stream is outside principal group scope", decision.reason)
    }

    @Test
    fun `descendant route policy allows child unit stream`() {
        val policyService = GroupPolicyService(
            groups = groups,
            routePolicies = StreamRoutePolicies.of(
                listOf(
                StreamRoutePolicy(
                    viewerGroupId = companyA.id,
                    publisherGroupId = companyB.id,
                    scope = StreamRouteScope.DESCENDANT_GROUPS,
                ),
                ),
            ),
            clock = clock,
        )
        val principal = AuthenticatedPrincipal("viewer-a", UserRole.VIEWER, companyA.id)
        val stream = StreamSessionDescriptor(StreamPath("raw/company-b/platoon-1/drone-1"), platoonB1.id, now)

        val decision = policyService.canViewStream(principal, stream)

        assertTrue(decision.allowed)
        assertEquals("explicit descendant route policy", decision.reason)
    }

    @Test
    fun `route policies are exposed through first class collection without leaking mutable list`() {
        val policies = StreamRoutePolicies.of(
            listOf(
                StreamRoutePolicy(
                    viewerGroupId = companyA.id,
                    publisherGroupId = companyB.id,
                    scope = StreamRouteScope.CROSS_GROUP,
                    expiresAt = now.plusSeconds(300),
                ),
            ),
        )

        assertEquals(1, policies.activeFor(companyA.id, now).size)
        assertEquals(emptyList(), policies.activeFor(companyA.id, now.plusSeconds(301)))
        assertEquals(1, policies.toList().size)
    }

    @Test
    fun `group hierarchy rejects missing parent before policy calculation`() {
        val error = assertFailsWith<IllegalArgumentException> {
            GroupPolicyService(
                listOf(
                    OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("missing")),
                ),
            )
        }

        assertEquals("parent group must exist", error.message)
    }

    @Test
    fun `group hierarchy rejects cycle before policy calculation`() {
        val error = assertFailsWith<IllegalArgumentException> {
            GroupPolicyService(
                listOf(
                    OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION, GroupId("co-a")),
                    OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
                ),
            )
        }

        assertEquals("group hierarchy must not contain a cycle", error.message)
    }
}
