package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GeoPoint
import kr.co.a4ai.gcssaker.authpolicy.domain.Geofence
import kr.co.a4ai.gcssaker.authpolicy.domain.GeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

class JdbcGeofenceRepository(dataSource: DataSource) : GeofenceRepository {
    private val jdbc = JdbcTemplate(dataSource)
    private val transactions = TransactionTemplate(DataSourceTransactionManager(dataSource))

    init {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }

    override fun save(geofence: Geofence): Geofence {
        transactions.executeWithoutResult {
            jdbc.update(GeofenceSql.deletePoints, geofence.id)
            jdbc.update(GeofenceSql.deleteGeofence, geofence.id)
            jdbc.update(
                GeofenceSql.insertGeofence,
                geofence.id,
                geofence.name,
                geofence.groupId.value,
                geofence.enabled,
            )
            geofence.polygon.forEachIndexed { index, point ->
                jdbc.update(GeofenceSql.insertPoint, geofence.id, index, point.latitude, point.longitude)
            }
        }
        return geofence
    }

    override fun findVisible(principal: AuthenticatedPrincipal, limit: Int, offset: Int): List<Geofence> =
        if (principal.role == UserRole.ADMIN) {
            findByFilter(GeofenceSql.selectAll, arrayOf(limit, offset))
        } else {
            findByFilter(GeofenceSql.selectByGroup, arrayOf(principal.groupId.value, limit, offset))
        }

    override fun findEnabled(groupId: GroupId): List<Geofence> =
        findByFilter(GeofenceSql.selectEnabledByGroup, arrayOf(groupId.value, 500, 0))

    override fun delete(id: String, principal: AuthenticatedPrincipal): Boolean {
        val allowed = principal.role == UserRole.ADMIN ||
            jdbc.queryForObject(GeofenceSql.countOwned, Int::class.java, id, principal.groupId.value) == 1
        if (!allowed) return false
        return jdbc.update(GeofenceSql.deleteGeofence, id) == 1
    }

    private fun findByFilter(sql: String, arguments: Array<Any>): List<Geofence> {
        val rows = jdbc.query(sql, { rs, _ ->
            GeofenceRow(
                id = rs.getString("id"), name = rs.getString("name"),
                groupId = GroupId(rs.getString("group_id")), enabled = rs.getBoolean("enabled"),
                point = rs.getObject("point_order")?.let { GeoPoint(rs.getDouble("latitude"), rs.getDouble("longitude")) },
            )
        }, *arguments)
        return rows.groupBy { it.id }.values.map { group ->
            val first = group.first()
            Geofence(
                id = first.id, name = first.name, groupId = first.groupId,
                polygon = group.mapNotNull { it.point }, enabled = first.enabled,
            )
        }
    }
}

private data class GeofenceRow(
    val id: String,
    val name: String,
    val groupId: GroupId,
    val enabled: Boolean,
    val point: GeoPoint?,
)

private object GeofenceSql {
    const val selectAll = """
        WITH page AS (SELECT id, name, group_id, enabled FROM geofences ORDER BY name, id LIMIT ? OFFSET ?)
        SELECT page.*, point.point_order, point.latitude, point.longitude FROM page
        LEFT JOIN geofence_points point ON point.geofence_id = page.id ORDER BY page.name, page.id, point.point_order
    """
    const val selectByGroup = """
        WITH page AS (SELECT id, name, group_id, enabled FROM geofences WHERE group_id = ? ORDER BY name, id LIMIT ? OFFSET ?)
        SELECT page.*, point.point_order, point.latitude, point.longitude FROM page
        LEFT JOIN geofence_points point ON point.geofence_id = page.id ORDER BY page.name, page.id, point.point_order
    """
    const val selectEnabledByGroup = """
        WITH page AS (SELECT id, name, group_id, enabled FROM geofences WHERE group_id = ? AND enabled = TRUE ORDER BY name, id LIMIT ? OFFSET ?)
        SELECT page.*, point.point_order, point.latitude, point.longitude FROM page
        LEFT JOIN geofence_points point ON point.geofence_id = page.id ORDER BY page.name, page.id, point.point_order
    """
    const val countOwned = "SELECT COUNT(*) FROM geofences WHERE id = ? AND group_id = ?"
    const val deletePoints = "DELETE FROM geofence_points WHERE geofence_id = ?"
    const val deleteGeofence = "DELETE FROM geofences WHERE id = ?"
    const val insertGeofence =
        "INSERT INTO geofences (id, name, group_id, enabled) VALUES (?, ?, ?, ?)"
    const val insertPoint =
        "INSERT INTO geofence_points (geofence_id, point_order, latitude, longitude) VALUES (?, ?, ?, ?)"
}
