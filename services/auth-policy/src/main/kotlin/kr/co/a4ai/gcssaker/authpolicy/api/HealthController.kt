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
    @GetMapping(HealthApiRoutes.HEALTHZ)
    fun healthz(): HealthReportResponse =
        HealthReportResponse(
            service = HealthContract.SERVICE_NAME,
            status = HealthContract.STATUS_OK,
            checks = listOf(
                HealthCheckResponse(
                    name = HealthContract.CHECK_API,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
            ),
        )

    @GetMapping(HealthApiRoutes.READYZ)
    fun readyz(): HealthReportResponse =
        HealthReportResponse(
            service = HealthContract.SERVICE_NAME,
            status = HealthContract.STATUS_OK,
            checks = listOf(
                HealthCheckResponse(
                    name = HealthContract.CHECK_AUTH_REPOSITORY,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
                HealthCheckResponse(
                    name = HealthContract.CHECK_JWT_TOKEN_SERVICE,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
                HealthCheckResponse(
                    name = HealthContract.CHECK_STREAM_POLICY,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
            ),
        )
}
