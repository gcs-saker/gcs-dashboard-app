package kr.co.a4ai.gcssaker.authpolicy.domain

import java.util.concurrent.CopyOnWriteArrayList

class InMemoryOperationalEventRepository(
    events: Collection<OperationalEventReadModel>,
) : OperationalEventRepository {
    private val events = CopyOnWriteArrayList(events.sortedByDescending { it.occurredAt })

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
            .sortedWith(compareByDescending<OperationalEventReadModel> { it.occurredAt }.thenByDescending { it.id })
            .toList()

    override fun append(event: OperationalEventReadModel) {
        events.add(event)
    }

    private fun OperationalEventReadModel.matchesQuery(rawQuery: String): Boolean {
        val normalizedQuery = rawQuery.trim().lowercase()
        return searchableText().any { it.contains(normalizedQuery) }
    }

    private fun OperationalEventReadModel.searchableText(): List<String> =
        listOf(
            source,
            message,
            category,
            eventType.orEmpty(),
            sourceService.orEmpty(),
            streamId.orEmpty(),
            connectionId.orEmpty(),
            icePath.orEmpty(),
            relayFallbackReason.orEmpty(),
        ).map { it.lowercase() }
}
