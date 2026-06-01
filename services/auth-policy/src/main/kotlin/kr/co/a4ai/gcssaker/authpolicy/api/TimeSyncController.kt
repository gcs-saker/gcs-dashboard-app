package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncConfigRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncHealth
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncMode
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatus
import kr.co.a4ai.gcssaker.authpolicy.domain.TimeSyncStatusService
import kr.co.a4ai.gcssaker.authpolicy.domain.UpdateTimeSyncConfigCommand
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

data class TimeSyncConfigRequest(
    val mode: String,
    val sourceHost: String? = null,
    val sourcePort: Int? = null,
    val driftWarnMs: Long? = null,
)

data class TimeSyncStatusResponse(
    val mode: String,
    val sourceHost: String?,
    val sourcePort: Int,
    val driftWarnMs: Long,
    val updatedAt: Instant,
    val updatedBy: String,
    val serverTime: Instant,
    val monotonicMs: Long,
    val timezone: String,
    val checkedAt: Instant,
    val health: String,
    val message: String,
)

@RestController
class TimeSyncController(
    private val repository: TimeSyncConfigRepository,
    private val statusService: TimeSyncStatusService,
    private val principalResolver: BearerPrincipalResolver,
) {
    @GetMapping(OpsApiRoutes.TIME_STATUS)
    fun status(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
    ): TimeSyncStatusResponse {
        principalResolver.requirePrincipal(authorization)
        return statusService.status().toResponse()
    }

    @PostMapping(OpsApiRoutes.TIME_CHECK)
    fun check(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
    ): TimeSyncStatusResponse {
        principalResolver.requirePrincipal(authorization)
        return statusService.status().toResponse()
    }

    @PutMapping(OpsApiRoutes.TIME_CONFIG)
    fun updateConfig(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
        @RequestBody request: TimeSyncConfigRequest,
    ): TimeSyncStatusResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        requireOperator(principal)
        try {
            repository.update(
                UpdateTimeSyncConfigCommand(
                    mode = request.mode,
                    sourceHost = request.sourceHost,
                    sourcePort = request.sourcePort,
                    driftWarnMs = request.driftWarnMs,
                ),
                principal,
                Instant.now(),
            )
        } catch (exc: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, exc.message ?: AuthErrorMessages.INVALID_TIME_SYNC_CONFIG)
        }
        return statusService.status().toResponse()
    }

    private fun requireOperator(principal: AuthenticatedPrincipal) {
        if (principal.role != UserRole.OPERATOR && principal.role != UserRole.ADMIN) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, AuthErrorMessages.OPERATOR_ROLE_REQUIRED)
        }
    }
}

private fun TimeSyncStatus.toResponse(): TimeSyncStatusResponse =
    TimeSyncStatusResponse(
        mode = config.mode.toResponseValue(),
        sourceHost = config.sourceHost,
        sourcePort = config.sourcePort,
        driftWarnMs = config.driftWarnMs,
        updatedAt = config.updatedAt,
        updatedBy = config.updatedBy,
        serverTime = serverTime,
        monotonicMs = monotonicMs,
        timezone = timezone,
        checkedAt = checkedAt,
        health = health.toResponseValue(),
        message = message,
    )

private fun TimeSyncMode.toResponseValue(): String =
    when (this) {
        TimeSyncMode.PUBLIC -> "public"
        TimeSyncMode.CLOSED_NETWORK -> "closed_network"
        TimeSyncMode.MANUAL -> "manual"
    }

private fun TimeSyncHealth.toResponseValue(): String =
    name.lowercase()
