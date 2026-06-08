package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

data class OperationalEventReadModel(
    val id: String,
    val occurredAt: Instant,
    val severity: String,
    val category: String,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
    val groupId: GroupId,
)

data class OperationalEventQuery(
    val query: String? = null,
    val severity: String? = null,
    val from: Instant? = null,
    val to: Instant? = null,
)

interface OperationalEventRepository {
    fun eventsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): List<OperationalEventReadModel>
}

class InMemoryOperationalEventRepository(
    events: Collection<OperationalEventReadModel>,
) : OperationalEventRepository {
    private val events = events.sortedByDescending { it.occurredAt }

    override fun eventsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventReadModel> =
        events
            .asSequence()
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .filter { event -> query.query.isNullOrBlank() || event.matchesQuery(query.query) }
            .filter { event -> query.severity.isNullOrBlank() || event.severity.equals(query.severity, ignoreCase = true) }
            .filter { event -> query.from == null || !event.occurredAt.isBefore(query.from) }
            .filter { event -> query.to == null || !event.occurredAt.isAfter(query.to) }
            .toList()

    private fun OperationalEventReadModel.matchesQuery(rawQuery: String): Boolean {
        val normalizedQuery = rawQuery.trim().lowercase()
        return source.lowercase().contains(normalizedQuery) ||
            message.lowercase().contains(normalizedQuery) ||
            category.lowercase().contains(normalizedQuery)
    }
}
