package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.AuthRuntimeSettings
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

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
class HealthController(
    private val settings: AuthRuntimeSettings? = null,
    private val dataSource: DataSource? = null,
    private val redisTemplate: StringRedisTemplate? = null,
) {
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
    fun readyz(): ResponseEntity<HealthReportResponse> {
        val checks = listOf(
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
            jdbcCheck(),
            redisCheck(),
        )
        val isReady = checks.none { it.required && it.status != HealthContract.STATUS_OK }
        val report = HealthReportResponse(
            service = HealthContract.SERVICE_NAME,
            status = if (isReady) HealthContract.STATUS_OK else HealthContract.STATUS_DEGRADED,
            checks = checks,
        )
        return ResponseEntity
            .status(if (isReady) HttpStatus.OK else HttpStatus.SERVICE_UNAVAILABLE)
            .body(report)
    }

    private fun jdbcCheck(): HealthCheckResponse {
        val required = settings?.jdbcPersistenceEnabled == true
        val source = dataSource
        if (source == null) {
            return dependencyCheck(HealthContract.CHECK_JDBC, required, !required, HealthContract.REASON_NOT_CONFIGURED)
        }
        val isValid = runCatching {
            source.connection.use { connection ->
                connection.isValid(HealthContract.DEPENDENCY_VALIDATION_TIMEOUT_SECONDS)
            }
        }.getOrDefault(false)
        return dependencyCheck(HealthContract.CHECK_JDBC, required, isValid, HealthContract.REASON_CONNECTION_INVALID)
    }

    private fun redisCheck(): HealthCheckResponse {
        val required = settings?.let { it.redisPrincipalCacheEnabled || it.redisRefreshSessionEnabled } == true
        val redis = redisTemplate
        if (redis == null) {
            return dependencyCheck(HealthContract.CHECK_REDIS, required, !required, HealthContract.REASON_NOT_CONFIGURED)
        }
        val isValid = runCatching {
            val connection = redis.connectionFactory?.connection ?: return@runCatching false
            try {
                connection.ping().equals(HealthContract.REDIS_PONG, ignoreCase = true)
            } finally {
                connection.close()
            }
        }.getOrDefault(false)
        return dependencyCheck(HealthContract.CHECK_REDIS, required, isValid, HealthContract.REASON_PING_FAILED)
    }

    private fun dependencyCheck(
        name: String,
        required: Boolean,
        isHealthy: Boolean,
        failureReason: String,
    ): HealthCheckResponse =
        HealthCheckResponse(
            name = name,
            status = if (isHealthy) HealthContract.STATUS_OK else HealthContract.STATUS_DEGRADED,
            required = required,
            reason = if (isHealthy) null else failureReason.ifBlank { HealthContract.REASON_UNAVAILABLE },
        )
}
