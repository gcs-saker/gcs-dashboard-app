package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.time.Instant
import java.util.concurrent.TimeUnit

class OperationalEventStreamWriter(
    private val repository: OperationalEventRepository,
    private val objectMapper: ObjectMapper,
    private val streamPolicy: OperationalEventStreamPolicy,
) {
    fun body(principal: AuthenticatedPrincipal, query: OperationalEventQuery): StreamingResponseBody =
        StreamingResponseBody { output ->
            val deliveredIds = LinkedHashSet<String>()
            repeat(streamPolicy.pollCount) { index ->
                val events = repository.eventsFor(principal, query)
                for (event in events.asReversed()) {
                    if (deliveredIds.add(event.id)) {
                        output.writeOperationalEventSseEvent(
                            OperationalEventStreamContract.EVENT_OPERATIONAL_EVENT,
                            event.toResponse(),
                            objectMapper,
                        )
                    }
                }
                output.writeOperationalEventSseEvent(
                    OperationalEventStreamContract.EVENT_HEARTBEAT,
                    OperationalEventStreamHeartbeatResponse(Instant.now()),
                    objectMapper,
                )
                output.flush()
                if (index < streamPolicy.pollCount - 1 && streamPolicy.pollIntervalMillis > 0) {
                    TimeUnit.MILLISECONDS.sleep(streamPolicy.pollIntervalMillis)
                }
            }
        }
}
