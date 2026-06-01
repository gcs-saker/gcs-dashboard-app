package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class HealthCheckResponse(
    val name: String,
    val status: String,
    val required: Boolean,
    val reason: String? = null,
)

data class HealthReportResponse(
    val service: String,
    val status: String,
    val checks: List<HealthCheckResponse>,
)

@RestController
class HealthController {
    @GetMapping("/healthz")
    fun healthz(): HealthReportResponse =
        HealthReportResponse(
            service = "auth-policy",
            status = "ok",
            checks = listOf(HealthCheckResponse(name = "api", status = "ok", required = true)),
        )

    @GetMapping("/readyz")
    fun readyz(): HealthReportResponse =
        HealthReportResponse(
            service = "auth-policy",
            status = "ok",
            checks = listOf(
                HealthCheckResponse(name = "auth_repository", status = "ok", required = true),
                HealthCheckResponse(name = "jwt_token_service", status = "ok", required = true),
                HealthCheckResponse(name = "stream_policy", status = "ok", required = true),
            ),
        )
}
