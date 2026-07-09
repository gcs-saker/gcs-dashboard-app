package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchy
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import org.springframework.jdbc.core.JdbcTemplate
import javax.sql.DataSource

class JdbcOrganizationHierarchyRepository(
    dataSource: DataSource,
    seedUnits: Collection<OrganizationUnit>,
) : OrganizationHierarchyRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
        seedMissingGroups(seedUnits)
        rebuildClosure(current())
    }

    override fun current(): OrganizationHierarchy =
        OrganizationHierarchy.of(
            jdbc.query(
                GroupHierarchySql.selectGroups,
                { rs, _ ->
                OrganizationUnit(
                    id = GroupId(rs.getString(GroupHierarchyColumns.id)),
                    name = rs.getString(GroupHierarchyColumns.name),
                    type = GroupType.valueOf(rs.getString(GroupHierarchyColumns.type)),
                    parentId = rs.getString(GroupHierarchyColumns.parentId)?.let(::GroupId),
                )
                },
                GroupHierarchyContract.ACTIVE_STATUS,
            ),
        )

    private fun seedMissingGroups(seedUnits: Collection<OrganizationUnit>) {
        seedUnits.forEach { unit ->
            val existing = jdbc.queryForObject(GroupHierarchySql.countGroupById, Int::class.java, unit.id.value) ?: 0
            if (existing == 0) {
                jdbc.update(
                    GroupHierarchySql.insertGroup,
                    unit.id.value,
                    unit.name,
                    unit.type.name,
                    unit.parentId?.value,
                    GroupHierarchyContract.ACTIVE_STATUS,
                )
            }
        }
    }

    private fun rebuildClosure(hierarchy: OrganizationHierarchy) {
        val unitsById = hierarchy.units().associateBy { it.id }
        jdbc.update(GroupHierarchySql.deleteClosure)
        unitsById.values.forEach { unit ->
            var current: GroupId? = unit.id
            var depth = 0
            while (current != null) {
                jdbc.update(GroupHierarchySql.insertClosure, current.value, unit.id.value, depth)
                current = unitsById[current]?.parentId
                depth += 1
            }
        }
    }
}

private object GroupHierarchyColumns {
    const val id = "id"
    const val name = "name"
    const val type = "type"
    const val parentId = "parent_id"
}

private object GroupHierarchyContract {
    const val ACTIVE_STATUS = "active"
}

private object GroupHierarchySql {
    const val countGroupById = "SELECT COUNT(*) FROM organization_groups WHERE id = ?"
    const val deleteClosure = "DELETE FROM organization_group_closure"
    const val selectGroups = """
        SELECT id, name, type, parent_id
        FROM organization_groups
        WHERE status = ?
        ORDER BY id
    """
    const val insertGroup = """
        INSERT INTO organization_groups (id, name, type, parent_id, status)
        VALUES (?, ?, ?, ?, ?)
    """
    const val insertClosure = """
        INSERT INTO organization_group_closure (ancestor_group_id, descendant_group_id, depth)
        VALUES (?, ?, ?)
    """
}
