package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper

internal class JdbcGroupHierarchyDao(private val jdbc: JdbcTemplate) {
    fun listAll(): List<OrganizationUnit> = jdbc.query(SELECT_BASE + " ORDER BY id", rowMapper)
    fun active(): List<OrganizationUnit> = jdbc.query(SELECT_BASE + " WHERE status = ? ORDER BY id", rowMapper, GroupStatus.ACTIVE.name.lowercase())

    fun seedMissing(units: Collection<OrganizationUnit>) {
        val existing = listAll().map { it.id }.toMutableSet()
        units.forEach { unit ->
            // Existing bootstrap semantics initialize missing configured seed groups as active.
            if (existing.add(unit.id)) insert(unit.copy(status = GroupStatus.ACTIVE))
        }
    }

    fun insert(unit: OrganizationUnit) {
        validateFields(unit)
        jdbc.update(INSERT, unit.id.value, unit.name, unit.type.name, unit.parentId?.value, unit.status.name.lowercase())
    }

    fun update(unit: OrganizationUnit) {
        validateFields(unit)
        if (jdbc.update(UPDATE, unit.name, unit.type.name, unit.parentId?.value, unit.status.name.lowercase(), unit.id.value) != 1) {
            throw ResourceNotFoundError("group_not_found", "group not found")
        }
    }

    private fun validateFields(unit: OrganizationUnit) {
        if (unit.id.value.length > MAX_GROUP_ID_LENGTH || unit.name.length > MAX_GROUP_NAME_LENGTH ||
            (unit.parentId?.value?.length ?: 0) > MAX_GROUP_ID_LENGTH
        ) throw InvalidContractError("group_fields_invalid", "group fields exceed persistence limits")
    }

    private companion object {
        const val MAX_GROUP_ID_LENGTH = 64
        const val MAX_GROUP_NAME_LENGTH = 128
        const val SELECT_BASE = "SELECT id, name, type, parent_id, status FROM organization_groups"
        const val INSERT = "INSERT INTO organization_groups (id, name, type, parent_id, status) VALUES (?, ?, ?, ?, ?)"
        const val UPDATE = """UPDATE organization_groups SET name = ?, type = ?, parent_id = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?"""
        val rowMapper = RowMapper<OrganizationUnit> { row, _ ->
            OrganizationUnit(GroupId(row.getString("id")), row.getString("name"), GroupType.valueOf(row.getString("type")),
                row.getString("parent_id")?.let(::GroupId), GroupStatus.valueOf(row.getString("status").uppercase()))
        }
    }
}
