package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper

data class OperationalEventStreamPolicy(
    val pollCount: Int = OperationalEventStreamContract.DEFAULT_POLL_COUNT,
    val pollIntervalMillis: Long = OperationalEventStreamContract.DEFAULT_POLL_INTERVAL_MILLIS,
) {
    init {
        require(pollCount in 1..OperationalEventStreamContract.MAX_POLL_COUNT)
        require(pollIntervalMillis >= 0)
    }
}

object OperationalEventStreamContract {
    const val DEFAULT_POLL_COUNT = 30
    const val MAX_POLL_COUNT = 120
    const val DEFAULT_POLL_INTERVAL_MILLIS = 1_000L
    const val BATCH_LIMIT = 100
    const val EVENT_OPERATIONAL_EVENT = "operational-event"
    const val EVENT_HEARTBEAT = "heartbeat"
    const val FIELD_EVENT = "event"
    const val FIELD_DATA = "data"
    const val HEADER_ACCEL_BUFFERING = "X-Accel-Buffering"
    const val HEADER_VALUE_NO = "no"
}

internal fun java.io.OutputStream.writeOperationalEventSseEvent(
    eventName: String,
    payload: Any,
    objectMapper: ObjectMapper,
) {
    write("${OperationalEventStreamContract.FIELD_EVENT}: $eventName\n".toByteArray(Charsets.UTF_8))
    write("${OperationalEventStreamContract.FIELD_DATA}: ${objectMapper.writeValueAsString(payload)}\n\n".toByteArray(Charsets.UTF_8))
}
