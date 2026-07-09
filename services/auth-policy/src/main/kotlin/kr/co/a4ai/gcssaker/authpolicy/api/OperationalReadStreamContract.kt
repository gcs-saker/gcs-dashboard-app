package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper

data class OperationalReadStreamPolicy(
    val pollCount: Int = OperationalReadStreamContract.DEFAULT_POLL_COUNT,
    val pollIntervalMillis: Long = OperationalReadStreamContract.DEFAULT_POLL_INTERVAL_MILLIS,
) {
    init {
        require(pollCount in 1..OperationalReadStreamContract.MAX_POLL_COUNT)
        require(pollIntervalMillis >= 0)
    }
}

object OperationalReadStreamContract {
    const val DEFAULT_POLL_COUNT = 30
    const val MAX_POLL_COUNT = 120
    const val DEFAULT_POLL_INTERVAL_MILLIS = 1_000L
    const val EVENT_STREAM_SESSIONS = "stream-sessions"
    const val EVENT_HEARTBEAT = "heartbeat"
    const val FIELD_EVENT = "event"
    const val FIELD_DATA = "data"
    const val HEADER_ACCEL_BUFFERING = "X-Accel-Buffering"
    const val HEADER_VALUE_NO = "no"
}

internal fun java.io.OutputStream.writeOperationalReadSseEvent(
    eventName: String,
    payload: Any,
    objectMapper: ObjectMapper,
) {
    write("${OperationalReadStreamContract.FIELD_EVENT}: $eventName\n".toByteArray(Charsets.UTF_8))
    write("${OperationalReadStreamContract.FIELD_DATA}: ${objectMapper.writeValueAsString(payload)}\n\n".toByteArray(Charsets.UTF_8))
}
