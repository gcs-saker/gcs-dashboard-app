package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper

internal class JdbcGroupClosureDao(private val jdbc: JdbcTemplate) {
    fun readAll(): List<GroupClosureRelation> = jdbc.query(SELECT_BASE, rowMapper)

    fun readFor(descendants: Set<GroupId>): List<GroupClosureRelation> = descendants.sortedBy { it.value }.chunked(BATCH_SIZE).flatMap { batch ->
        jdbc.query(SELECT_BASE + " WHERE descendant_group_id IN (${markers(batch.size)})", rowMapper, *batch.map { it.value }.toTypedArray())
    }

    fun synchronize(actual: Collection<GroupClosureRelation>, desired: Collection<GroupClosureRelation>) {
        val delta = GroupClosureDelta.between(actual, desired)
        delete(delta.removed)
        insert(delta.inserted)
        update(delta.updated)
    }

    private fun delete(relations: List<GroupClosureRelation>) {
        for (batch in relations.chunked(BATCH_SIZE)) {
            val pairs = List(batch.size) { "(?, ?)" }.joinToString(",")
            jdbc.update("DELETE FROM organization_group_closure WHERE (ancestor_group_id, descendant_group_id) IN ($pairs)",
                *batch.flatMap { listOf(it.ancestor.value, it.descendant.value) }.toTypedArray())
        }
    }

    private fun insert(relations: List<GroupClosureRelation>) {
        for (batch in relations.chunked(BATCH_SIZE)) {
            val values = List(batch.size) { "(?, ?, ?)" }.joinToString(",")
            jdbc.update("INSERT INTO organization_group_closure (ancestor_group_id, descendant_group_id, depth) VALUES $values",
                *batch.flatMap { listOf<Any>(it.ancestor.value, it.descendant.value, it.depth) }.toTypedArray())
        }
    }

    private fun update(relations: List<GroupClosureRelation>) {
        for (batch in relations.chunked(BATCH_SIZE)) {
            jdbc.batchUpdate("UPDATE organization_group_closure SET depth = ? WHERE ancestor_group_id = ? AND descendant_group_id = ?",
                batch.map { arrayOf<Any>(it.depth, it.ancestor.value, it.descendant.value) })
        }
    }

    private fun markers(count: Int): String = List(count) { "?" }.joinToString(",")

    private companion object {
        // Bound parameter counts and round trips per batch, rather than issuing a query per descendant.
        const val BATCH_SIZE = 256
        const val SELECT_BASE = "SELECT ancestor_group_id, descendant_group_id, depth FROM organization_group_closure"
        val rowMapper = RowMapper<GroupClosureRelation> { row, _ ->
            GroupClosureRelation(GroupId(row.getString("ancestor_group_id")), GroupId(row.getString("descendant_group_id")), row.getInt("depth"))
        }
    }
}
