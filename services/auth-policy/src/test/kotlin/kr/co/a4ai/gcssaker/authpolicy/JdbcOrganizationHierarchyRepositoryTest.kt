package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import org.h2.jdbcx.JdbcDataSource
import org.springframework.jdbc.core.JdbcTemplate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JdbcOrganizationHierarchyRepositoryTest {
    @Test
    fun `jdbc repository persists groups and rebuilds closure table`() {
        val dataSource = h2DataSource()
        val repository = JdbcOrganizationHierarchyRepository(dataSource, seedUnits())
        val jdbc = JdbcTemplate(dataSource)

        val hierarchy = repository.current()

        assertEquals(3, hierarchy.units().size)
        assertTrue(hierarchy.isAncestor(GroupId("bn-1"), GroupId("plt-a-1")))
        assertEquals(6, jdbc.queryForObject(GroupHierarchyTestSql.countClosureRows, Int::class.java))
        assertEquals(
            2,
            jdbc.queryForObject(
                GroupHierarchyTestSql.depthBetweenGroups,
                Int::class.java,
                "bn-1",
                "plt-a-1",
            ),
        )
    }

    private fun h2DataSource(): JdbcDataSource =
        JdbcDataSource().apply {
            setURL("jdbc:h2:mem:group_hierarchy_${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
            user = "sa"
            password = ""
        }

    private fun seedUnits(): List<OrganizationUnit> =
        listOf(
            OrganizationUnit(GroupId("bn-1"), "1 Battalion", GroupType.BATTALION),
            OrganizationUnit(GroupId("co-a"), "A Company", GroupType.COMPANY, GroupId("bn-1")),
            OrganizationUnit(GroupId("plt-a-1"), "A Company 1 Platoon", GroupType.PLATOON, GroupId("co-a")),
        )
}

private object GroupHierarchyTestSql {
    const val countClosureRows = "SELECT COUNT(*) FROM organization_group_closure"
    const val depthBetweenGroups = """
        SELECT depth
        FROM organization_group_closure
        WHERE ancestor_group_id = ? AND descendant_group_id = ?
    """
}
