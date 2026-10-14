package kr.co.a4ai.gcssaker.authpolicy.configuration.observability

import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.net.URI

@Component
class InternalOtlpEndpointGuard(
    @param:Value("\${management.tracing.export.otlp.enabled:false}") private val enabled: Boolean,
    @param:Value("\${management.opentelemetry.tracing.export.otlp.endpoint}") private val endpoint: String,
) {
    @PostConstruct
    fun validate() {
        if (!enabled) return
        val uri = runCatching { URI(endpoint) }
            .getOrElse { throw IllegalArgumentException("OTLP endpoint is invalid", it) }
        require(uri.scheme == "http") { "OTLP endpoint must use the internal collector boundary" }
        require(uri.host in allowedHosts) { "OTLP endpoint must use the internal collector boundary" }
        require(uri.port == 4318 && uri.path == "/v1/traces") {
            "OTLP endpoint must use the internal trace receiver"
        }
    }

    private companion object {
        val allowedHosts = setOf("otel-collector", "127.0.0.1", "localhost")
    }
}
