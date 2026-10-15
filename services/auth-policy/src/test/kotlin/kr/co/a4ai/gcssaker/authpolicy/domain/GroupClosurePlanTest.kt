package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.random.Random

class GroupClosurePlanTest {
    private val planner = GroupClosurePlanner()
    private val units = listOf(unit("root-a"), unit("root-b"), unit("mid-a", "root-a"), unit("mid-b", "root-b"),
        unit("move", "mid-a"), unit("leaf", "move"), unit("other", "mid-a"))

    @Test
    fun `rename and type edits preserve every existing relation`() {
        val replacement = units.first { it.id.value == "move" }.copy(name = "Renamed", type = GroupType.SQUAD)
        val scope = planner.forChange(units, replacement)
        val before = oracle(units).filter { it.descendant in scope.descendants }
        assertEquals(GroupClosureDelta(emptyList(), emptyList(), emptyList()), GroupClosureDelta.between(before, scope.desired))
    }

    @Test
    fun `new leaf affects only itself while subtree moves preserve internal edges`() {
        val scope = planner.forChange(units, unit("new", "mid-a"))
        assertEquals(setOf(GroupId("new")), scope.descendants)
        assertEquals(3, scope.desired.size)
        val moved = planner.forChange(units, unit("move", "mid-b"))
        val delta = GroupClosureDelta.between(oracle(units).filter { it.descendant in moved.descendants }, moved.desired)
        assertEquals(setOf(GroupId("move"), GroupId("leaf")), moved.descendants)
        assertEquals(4, delta.removed.size)
        assertEquals(4, delta.inserted.size)
        assertTrue(delta.updated.isEmpty())
        assertFalse(delta.removed.any { it.ancestor == GroupId("move") })
    }

    @Test
    fun `depth changes update common ancestry rather than deleting retained identities`() {
        val scope = planner.forChange(units, unit("move", "root-a"))
        val delta = GroupClosureDelta.between(oracle(units).filter { it.descendant in scope.descendants }, scope.desired)
        assertEquals(2, delta.removed.size)
        assertEquals(2, delta.updated.size)
        assertTrue(delta.inserted.isEmpty())
        assertEquals(setOf(1, 2), delta.updated.map { it.depth }.toSet())
    }

    @Test
    fun `leaf deactivation and activation preserve unrelated active branches`() {
        val inactive = unit("leaf", "move").copy(status = GroupStatus.INACTIVE)
        val scope = planner.forChange(units, inactive)
        assertTrue(scope.desired.isEmpty())
        assertEquals(setOf(GroupId("leaf")), scope.descendants)
        val reactivated = planner.forChange(units.map { if (it.id == inactive.id) inactive else it }, inactive.copy(status = GroupStatus.ACTIVE))
        assertEquals(4, reactivated.desired.size)
        assertTrue(planner.complete(emptyList()).isEmpty())
    }

    @Test
    fun `cycle missing parent active child of inactive parent and duplicate rows fail closed`() {
        assertThrows<InvalidContractError> { planner.forChange(units, unit("root-a", "leaf")) }
        assertThrows<InvalidContractError> { planner.forChange(units, unit("move", "missing")) }
        assertThrows<InvalidContractError> { planner.forChange(units, unit("move", "mid-a").copy(status = GroupStatus.INACTIVE)) }
        val relation = GroupClosureRelation(GroupId("a"), GroupId("b"), 1)
        assertThrows<InvalidContractError> { GroupClosureDelta.between(listOf(relation, relation.copy(depth = 2)), emptyList()) }
    }

    @Test
    fun `two hundred deterministic valid mutations agree with independent full closure oracle`() {
        val random = Random(920)
        var current = (0 until 100).map { index -> unit("g-$index", if (index == 0) null else "g-${(index - 1) / 3}") }
        repeat(200) {
            val chosen = current[random.nextInt(1, current.size)]
            val old = oracle(current)
            val descendants = old.filter { it.ancestor == chosen.id }.map { it.descendant }.toSet()
            val parent = current.filter { it.id !in descendants }.random(random)
            val replacement = chosen.copy(parentId = parent.id)
            val scope = planner.forChange(current, replacement)
            val delta = GroupClosureDelta.between(old.filter { it.descendant in scope.descendants }, scope.desired)
            val changedKeys = delta.updated.map { it.ancestor to it.descendant }.toSet()
            val applied = (old - delta.removed.toSet()).filter { (it.ancestor to it.descendant) !in changedKeys }.toSet() + delta.inserted + delta.updated
            current = current.map { if (it.id == chosen.id) replacement else it }
            assertEquals(oracle(current), applied)
        }
    }

    private fun oracle(units: List<OrganizationUnit>): Set<GroupClosureRelation> {
        val active = units.filter { it.status == GroupStatus.ACTIVE }.associateBy { it.id }
        return active.keys.flatMap { child ->
            val result = mutableListOf<GroupClosureRelation>()
            var ancestor: GroupId? = child
            var depth = 0
            while (ancestor != null) {
                result.add(GroupClosureRelation(ancestor, child, depth++))
                ancestor = active[ancestor]?.parentId
            }
            result
        }.toSet()
    }

    private fun unit(id: String, parent: String? = null) = OrganizationUnit(GroupId(id), id, GroupType.PLATOON, parent?.let(::GroupId))
}
