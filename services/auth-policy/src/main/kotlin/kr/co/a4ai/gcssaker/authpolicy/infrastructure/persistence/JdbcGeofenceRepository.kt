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

    override fun findVisible(principal: AuthenticatedPrincipal): List<Geofence> =
        if (principal.role == UserRole.ADMIN) {
            findByFilter(GeofenceSql.selectAll, emptyArray())
        } else {
            findByFilter(GeofenceSql.selectByGroup, arrayOf(principal.groupId.value))
        }

    override fun findEnabled(groupId: GroupId): List<Geofence> =
        findByFilter(GeofenceSql.selectEnabledByGroup, arrayOf(groupId.value))

    override fun delete(id: String, principal: AuthenticatedPrincipal): Boolean {
        val allowed = principal.role == UserRole.ADMIN ||
            jdbc.queryForObject(GeofenceSql.countOwned, Int::class.java, id, principal.groupId.value) == 1
        if (!allowed) return false
        return jdbc.update(GeofenceSql.deleteGeofence, id) == 1
    }

    private fun findByFilter(sql: String, arguments: Array<Any>): List<Geofence> =
        jdbc.query(sql, { rs, _ ->
            val id = rs.getString("id")
            Geofence(
                id = id,
                name = rs.getString("name"),
                groupId = GroupId(rs.getString("group_id")),
                enabled = rs.getBoolean("enabled"),
                polygon = jdbc.query(
                    GeofenceSql.selectPoints,
                    { pointRow, _ -> GeoPoint(pointRow.getDouble("latitude"), pointRow.getDouble("longitude")) },
                    id,
                ),
            )
        }, *arguments).sortedBy { it.name }
}

private object GeofenceSql {
    const val selectAll = "SELECT id, name, group_id, enabled FROM geofences"
    const val selectByGroup = "SELECT id, name, group_id, enabled FROM geofences WHERE group_id = ?"
    const val selectEnabledByGroup =
        "SELECT id, name, group_id, enabled FROM geofences WHERE group_id = ? AND enabled = TRUE"
    const val selectPoints =
        "SELECT latitude, longitude FROM geofence_points WHERE geofence_id = ? ORDER BY point_order"
    const val countOwned = "SELECT COUNT(*) FROM geofences WHERE id = ? AND group_id = ?"
    const val deletePoints = "DELETE FROM geofence_points WHERE geofence_id = ?"
    const val deleteGeofence = "DELETE FROM geofences WHERE id = ?"
    const val insertGeofence =
        "INSERT INTO geofences (id, name, group_id, enabled) VALUES (?, ?, ?, ?)"
    const val insertPoint =
        "INSERT INTO geofence_points (geofence_id, point_order, latitude, longitude) VALUES (?, ?, ?, ?)"
}
