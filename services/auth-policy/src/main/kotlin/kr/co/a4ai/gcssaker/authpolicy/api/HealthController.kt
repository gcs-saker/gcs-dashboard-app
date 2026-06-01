package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class HealthResponse(
    val status: String,
    val service: String,
)

@RestController
class HealthController {
    @GetMapping("/healthz")
    fun healthz(): HealthResponse =
        HealthResponse(status = "ok", service = "auth-policy")
}
