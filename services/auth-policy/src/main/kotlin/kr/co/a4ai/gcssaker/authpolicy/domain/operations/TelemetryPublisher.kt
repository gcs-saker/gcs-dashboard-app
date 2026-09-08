package kr.co.a4ai.gcssaker.authpolicy.domain

fun interface TelemetryPublisher {
    fun publish(telemetry: TelemetryReadModel)

    companion object {
        val NOOP = TelemetryPublisher { }
    }
}
