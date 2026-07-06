package kr.co.a4ai.gcssaker.authpolicy.domain

interface OrganizationHierarchyRepository {
    fun current(): OrganizationHierarchy
}

class InMemoryOrganizationHierarchyRepository(
    units: Collection<OrganizationUnit>,
) : OrganizationHierarchyRepository {
    private val hierarchy = OrganizationHierarchy.of(units)

    override fun current(): OrganizationHierarchy = hierarchy
}
