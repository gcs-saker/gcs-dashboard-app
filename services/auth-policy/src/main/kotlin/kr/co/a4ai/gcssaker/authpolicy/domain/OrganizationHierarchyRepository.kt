package kr.co.a4ai.gcssaker.authpolicy.domain

interface OrganizationHierarchyRepository {
    fun current(): OrganizationHierarchy
    fun listAll(): List<OrganizationUnit>
    fun create(unit: OrganizationUnit): OrganizationUnit
    fun update(unit: OrganizationUnit): OrganizationUnit
}

class InMemoryOrganizationHierarchyRepository(
    units: Collection<OrganizationUnit>,
) : OrganizationHierarchyRepository {
    private val unitsById = units.associateBy { it.id }.toMutableMap()

    override fun current(): OrganizationHierarchy = OrganizationHierarchy.of(unitsById.values.filter { it.status == GroupStatus.ACTIVE })

    override fun listAll(): List<OrganizationUnit> = unitsById.values.sortedBy { it.id.value }

    @Synchronized
    override fun create(unit: OrganizationUnit): OrganizationUnit {
        require(!unitsById.containsKey(unit.id)) { "group already exists" }
        unit.parentId?.let { require(unitsById.containsKey(it)) { "parent group must exist" } }
        unitsById[unit.id] = unit
        return unit
    }

    @Synchronized
    override fun update(unit: OrganizationUnit): OrganizationUnit {
        require(unitsById.containsKey(unit.id)) { "group not found" }
        val candidate = unitsById.toMutableMap().also { it[unit.id] = unit }
        val active = candidate.values.filter { it.status == GroupStatus.ACTIVE }
        if (active.isNotEmpty()) OrganizationHierarchy.of(active)
        unitsById[unit.id] = unit
        return unit
    }
}
