package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryCursorCodec
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPage
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPageQuery

class TelemetryPageService(private val repository: OperationalReadRepository, private val cursors: TelemetryCursorCodec) {
    fun readPage(principal: AuthenticatedPrincipal, command: TelemetryPageCommand): TelemetryPage {
        val position = command.cursor?.let { cursors.decode(principal, it) }
        val rows = repository.telemetryPageFor(principal, TelemetryPageQuery(command.size, position))
        val items = rows.take(command.size.value)
        val next = if (rows.size > command.size.value) cursors.encode(principal, items.last().uuid) else null
        return TelemetryPage(items, next)
    }
}
