package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import java.time.Instant

internal object OperationalEventQueryParser {
    fun parse(
        query: String?,
        severity: String?,
        from: String?,
        to: String?,
    ): OperationalEventQuery =
        OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstant(OperationalEventQueryFields.FROM, from),
            to = parseInstant(OperationalEventQueryFields.TO, to),
        )

    private fun parseInstant(name: String, value: String?): Instant? {
        if (value.isNullOrBlank()) {
            return null
        }
        return runCatching { Instant.parse(value) }
            .getOrElse { throw BadRequestApiError("$name ${OperationalEventApiErrors.INSTANT_QUERY_REQUIRED}") }
    }
}
