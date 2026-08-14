package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertEquals

class HierarchicalAuthorizationContractTest {
    private val root = OrganizationUnit(GroupId("bn"), "Battalion", GroupType.BATTALION)
    private val companyA = OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY, root.id)
    private val platoonA = OrganizationUnit(GroupId("plt-a"), "A1", GroupType.PLATOON, companyA.id)
    private val companyB = OrganizationUnit(GroupId("co-b"), "B", GroupType.COMPANY, root.id)
    private val service = GroupAccessService(
        InMemoryOrganizationHierarchyRepository(listOf(root, companyA, platoonA, companyB)),
        InMemoryRegisteredDeviceRepository(),
    )

    @Test
    fun `role and hierarchy capability matrix remains closed by default`() {
        val cases = listOf(
            case(UserRole.VIEWER, companyA.id, companyA.id, expected(view = true)),
            case(UserRole.VIEWER, companyA.id, platoonA.id, expected()),
            case(UserRole.OPERATOR, companyA.id, companyA.id, expected(view = true, control = true, talkback = true, publish = true)),
            case(UserRole.OPERATOR, companyA.id, platoonA.id, expected()),
            case(UserRole.GROUP_ADMIN, companyA.id, companyA.id, expected(true, true, true, true, true)),
            case(UserRole.GROUP_ADMIN, companyA.id, platoonA.id, expected(view = true, talkback = true)),
            case(UserRole.GROUP_ADMIN, companyA.id, companyB.id, expected()),
            case(UserRole.GROUP_ADMIN, companyA.id, root.id, expected()),
            case(UserRole.ADMIN, companyA.id, companyB.id, expected(true, true, true, true, true)),
        )

        cases.forEach { contract ->
            val access = service.accessFor(
                AuthenticatedPrincipal("subject", contract.role, contract.principalGroup),
                contract.targetGroup,
            )
            assertEquals(contract.expected, access.toExpected(), "${contract.role} ${contract.principalGroup.value} -> ${contract.targetGroup.value}")
        }
    }

    private fun case(role: UserRole, principalGroup: GroupId, targetGroup: GroupId, expected: Expected) =
        ContractCase(role, principalGroup, targetGroup, expected)

    private fun expected(
        view: Boolean = false,
        control: Boolean = false,
        manage: Boolean = false,
        talkback: Boolean = false,
        publish: Boolean = false,
    ) = Expected(view, control, manage, talkback, publish)

    private fun GroupAccess.toExpected() = Expected(canView, canControl, canManage, canSendTalkback, canPublish)
    private data class ContractCase(val role: UserRole, val principalGroup: GroupId, val targetGroup: GroupId, val expected: Expected)
    private data class Expected(val view: Boolean, val control: Boolean, val manage: Boolean, val talkback: Boolean, val publish: Boolean)
}
