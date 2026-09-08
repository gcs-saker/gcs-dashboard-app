package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GeoPoint
import kr.co.a4ai.gcssaker.authpolicy.domain.Geofence
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcGeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.JdbcOrganizationHierarchyRepository
import org.h2.jdbcx.JdbcDataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class JdbcGeofenceRepositoryTest {
    @Test
    fun `geofences survive repository recreation and preserve polygon order`() {
        val dataSource = dataSource()
        seedGroup(dataSource)
        val original = geofence("zone-a", GroupId("co-a"))
        JdbcGeofenceRepository(dataSource).save(original)

        val restored = JdbcGeofenceRepository(dataSource).findEnabled(GroupId("co-a"))

        assertEquals(listOf(original), restored)
    }

    @Test
    fun `non admin principals cannot see or delete another group geofence`() {
        val dataSource = dataSource()
        seedGroups(dataSource)
        val repository = JdbcGeofenceRepository(dataSource)
        repository.save(geofence("zone-b", GroupId("co-b")))
        val companyAOperator = principal(GroupId("co-a"), UserRole.OPERATOR)

        assertTrue(repository.findVisible(companyAOperator).isEmpty())
        assertFalse(repository.delete("zone-b", companyAOperator))
        assertTrue(repository.findEnabled(GroupId("co-b")).isNotEmpty())
    }

    private fun geofence(id: String, groupId: GroupId) = Geofence(
        id = id,
        name = "Safety zone",
        groupId = groupId,
        polygon = listOf(GeoPoint(35.0, 128.0), GeoPoint(35.1, 128.0), GeoPoint(35.1, 128.1)),
    )

    private fun principal(groupId: GroupId, role: UserRole) =
        AuthenticatedPrincipal("operator", role, groupId)

    private fun seedGroup(dataSource: JdbcDataSource) =
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(OrganizationUnit(GroupId("co-a"), "Company A", GroupType.COMPANY)),
        )

    private fun seedGroups(dataSource: JdbcDataSource) =
        JdbcOrganizationHierarchyRepository(
            dataSource,
            listOf(
                OrganizationUnit(GroupId("co-a"), "Company A", GroupType.COMPANY),
                OrganizationUnit(GroupId("co-b"), "Company B", GroupType.COMPANY),
            ),
        )

    private fun dataSource() = JdbcDataSource().apply {
        setURL("jdbc:h2:mem:geofence_${System.nanoTime()};MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
        user = "sa"
        password = ""
    }
}
