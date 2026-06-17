package kr.co.a4ai.gcssaker.authpolicy.api

import graphql.schema.DataFetchingEnvironment
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.graphql.data.method.annotation.Argument
import org.springframework.graphql.data.method.annotation.QueryMapping
import org.springframework.stereotype.Controller
import java.time.Instant

@Controller
class OperationalEventGraphQlController(
    private val repository: OperationalEventRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val auditPublisher: OperationalAuditPublisher = NoopOperationalAuditPublisher,
) {
    @QueryMapping(name = GraphQlQueryNames.OPERATIONAL_EVENTS)
    @RequiresBearerAuth
    fun operationalEvents(
        @Argument query: String?,
        @Argument severity: String?,
        @Argument from: String?,
        @Argument to: String?,
        environment: DataFetchingEnvironment,
    ): List<OperationalEventGraphQlResponse> {
        val principal = principalResolver.requirePrincipal(
            environment.graphQlContext.get(GraphQlContextKeys.AUTHORIZATION_HEADER),
        )
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseGraphQlInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseGraphQlInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val events = repository.eventsFor(principal, eventQuery)
        auditPublisher.publish(principal, eventQuery, events.size)
        return events.map { it.toGraphQlResponse() }
    }

    @QueryMapping(name = GraphQlQueryNames.OPERATIONAL_EVENT_PAGE)
    @RequiresBearerAuth
    fun operationalEventPage(
        @Argument query: String?,
        @Argument severity: String?,
        @Argument from: String?,
        @Argument to: String?,
        @Argument limit: Int?,
        @Argument after: String?,
        environment: DataFetchingEnvironment,
    ): OperationalEventPageGraphQlResponse {
        val principal = principalResolver.requirePrincipal(
            environment.graphQlContext.get(GraphQlContextKeys.AUTHORIZATION_HEADER),
        )
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseGraphQlInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseGraphQlInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val page = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(
                filter = eventQuery,
                limit = OperationalEventPageLimit.from(limit),
                after = OperationalEventCursor.decode(after),
            ),
        )
        auditPublisher.publish(principal, eventQuery, page.events.size)
        return OperationalEventPageGraphQlResponse(
            events = page.events.map { it.toGraphQlResponse() },
            nextCursor = page.nextCursor?.encode(),
        )
    }
}

data class OperationalEventPageGraphQlResponse(
    val events: List<OperationalEventGraphQlResponse>,
    val nextCursor: String?,
)

data class OperationalEventGraphQlResponse(
    val id: String,
    val occurredAt: String,
    val severity: String,
    val category: String,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
)

private fun parseGraphQlInstantQuery(name: String, value: String?): Instant? {
    if (value.isNullOrBlank()) {
        return null
    }
    return runCatching { Instant.parse(value) }
        .getOrElse { throw BadRequestApiError("$name ${OperationalEventApiErrors.INSTANT_QUERY_REQUIRED}") }
}

private fun OperationalEventReadModel.toGraphQlResponse(): OperationalEventGraphQlResponse =
    OperationalEventGraphQlResponse(
        id = id,
        occurredAt = occurredAt.toString(),
        severity = severity,
        category = category,
        source = source,
        message = message,
        connections = connections,
        latencyMs = latencyMs,
        throughputMbps = throughputMbps,
    )
