package kr.co.a4ai.gcssaker.authpolicy.domain

data class GroupClosureRelation(val ancestor: GroupId, val descendant: GroupId, val depth: Int) {
    init {
        if (depth < 0) throw InvalidContractError("group_closure_depth_invalid", "group closure depth must not be negative")
    }
}
data class GroupClosureScope(val descendants: Set<GroupId>, val desired: Set<GroupClosureRelation>)
data class GroupClosureDelta(
    val removed: List<GroupClosureRelation>, val inserted: List<GroupClosureRelation>, val updated: List<GroupClosureRelation>,
) {
    companion object {
        fun between(actual: Collection<GroupClosureRelation>, desired: Collection<GroupClosureRelation>): GroupClosureDelta {
            val before = actual.associateBy { it.ancestor to it.descendant }
            val after = desired.associateBy { it.ancestor to it.descendant }
            if (before.size != actual.size || after.size != desired.size) {
                throw InvalidContractError("group_closure_duplicate", "group closure contains duplicate identities")
            }
            val ordered = compareBy<GroupClosureRelation> { it.ancestor.value }.thenBy { it.descendant.value }
            return GroupClosureDelta(
                (before.keys - after.keys).map { before.getValue(it) }.sortedWith(ordered),
                (after.keys - before.keys).map { after.getValue(it) }.sortedWith(ordered),
                (before.keys intersect after.keys).filter { before[it] != after[it] }
                    .map { after.getValue(it) }.sortedWith(ordered),
            )
        }
    }
}

class GroupClosurePlanner {
    fun forChange(existing: Collection<OrganizationUnit>, replacement: OrganizationUnit): GroupClosureScope {
        val before = activeGroups(existing)
        val after = activeGroups(existing.filter { it.id != replacement.id } + replacement)
        val affected = descendants(before, replacement.id) + descendants(after, replacement.id)
        return GroupClosureScope(affected, relations(after, affected))
    }

    fun complete(units: Collection<OrganizationUnit>): Set<GroupClosureRelation> {
        val active = activeGroups(units)
        return relations(active, active.keys)
    }

    private fun activeGroups(units: Collection<OrganizationUnit>): Map<GroupId, OrganizationUnit> {
        val active = units.filter { it.status == GroupStatus.ACTIVE }
        if (active.isEmpty()) return emptyMap()
        try {
            OrganizationHierarchy.of(active)
        } catch (_: IllegalArgumentException) {
            throw InvalidContractError("group_hierarchy_invalid", "active group hierarchy is invalid")
        }
        return active.associateBy { it.id }
    }

    private fun descendants(units: Map<GroupId, OrganizationUnit>, root: GroupId): Set<GroupId> {
        if (root !in units) return emptySet()
        val children = units.values.groupBy { it.parentId }
        val pending = java.util.ArrayDeque<GroupId>().apply { add(root) }
        val affected = mutableSetOf<GroupId>()
        while (pending.isNotEmpty()) {
            val current = pending.removeFirst()
            if (!affected.add(current)) continue
            children[current].orEmpty().forEach { pending.add(it.id) }
        }
        return affected
    }

    private fun relations(units: Map<GroupId, OrganizationUnit>, descendants: Set<GroupId>): Set<GroupClosureRelation> {
        val result = mutableSetOf<GroupClosureRelation>()
        for (descendant in descendants) {
            if (descendant !in units) continue
            var ancestor: GroupId? = descendant
            var depth = 0
            while (ancestor != null) {
                result.add(GroupClosureRelation(ancestor, descendant, depth++))
                ancestor = units[ancestor]?.parentId
            }
        }
        return result
    }
}
