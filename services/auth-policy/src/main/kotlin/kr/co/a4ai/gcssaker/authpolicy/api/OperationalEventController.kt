package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
class OperationalEventController(
    private val repository: OperationalEventRepository,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping(OperationalEventApiRoutes.EVENTS)
    fun events(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): List<OperationalEventResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.eventsFor(
            principal,
            OperationalEventQuery(
                query = query,
                severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
                from = parseInstantQuery("from", from),
                to = parseInstantQuery("to", to),
            ),
        ).map { it.toResponse() }
    }
}

private fun parseInstantQuery(name: String, value: String?): Instant? {
    if (value.isNullOrBlank()) {
        return null
    }
    return runCatching { Instant.parse(value) }
        .getOrElse { throw BadRequestApiError("$name ${OperationalEventApiErrors.INSTANT_QUERY_REQUIRED}") }
}

private fun OperationalEventReadModel.toResponse(): OperationalEventResponse =
    OperationalEventResponse(
        id = id,
        occurredAt = occurredAt,
        severity = severity,
        category = category,
        source = source,
        message = message,
        connections = connections,
        latencyMs = latencyMs,
        throughputMbps = throughputMbps,
    )
