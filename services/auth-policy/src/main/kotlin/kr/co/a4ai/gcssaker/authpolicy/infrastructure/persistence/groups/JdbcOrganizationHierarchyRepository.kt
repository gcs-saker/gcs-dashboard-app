package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.dao.DataAccessException
import javax.sql.DataSource

class JdbcOrganizationHierarchyRepository(dataSource: DataSource, seedUnits: Collection<OrganizationUnit>) : OrganizationHierarchyRepository {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = QUERY_TIMEOUT_SECONDS }
    private val groups = JdbcGroupHierarchyDao(jdbc)
    private val closure = JdbcGroupClosureDao(jdbc)
    private val planner = GroupClosurePlanner()
    private val transactions = GroupHierarchyTransactions(dataSource, jdbc)

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
        transactions.execute(GroupHierarchyOperation.INITIALIZE) {
            groups.seedMissing(seedUnits)
            val units = groups.listAll()
            if (units.none { it.status == GroupStatus.ACTIVE }) {
                throw InvalidContractError("group_hierarchy_invalid", "active group hierarchy must not be empty")
            }
            closure.synchronize(closure.readAll(), planner.complete(units))
        }
    }

    override fun current(): OrganizationHierarchy = OrganizationHierarchy.of(read(groups::active))
    override fun listAll(): List<OrganizationUnit> = read(groups::listAll)

    private fun read(query: () -> List<OrganizationUnit>): List<OrganizationUnit> = try {
        query()
    } catch (error: DataAccessException) {
        throw GroupHierarchyStorageError(GroupHierarchyErrorCode.UNAVAILABLE, error)
    }

    override fun create(unit: OrganizationUnit): OrganizationUnit = transactions.execute(GroupHierarchyOperation.CREATE) {
        val existing = groups.listAll()
        if (existing.any { it.id == unit.id }) throw StateConflictError("group_already_exists", "group already exists")
        val scope = planner.forChange(existing, unit)
        groups.insert(unit)
        closure.synchronize(closure.readFor(scope.descendants), scope.desired)
        unit
    }

    override fun update(unit: OrganizationUnit): OrganizationUnit = transactions.execute(GroupHierarchyOperation.UPDATE) {
        val existing = groups.listAll()
        if (existing.none { it.id == unit.id }) throw ResourceNotFoundError("group_not_found", "group not found")
        val scope = planner.forChange(existing, unit)
        groups.update(unit)
        closure.synchronize(closure.readFor(scope.descendants), scope.desired)
        unit
    }

    private companion object {
        const val QUERY_TIMEOUT_SECONDS = 3
    }
}
