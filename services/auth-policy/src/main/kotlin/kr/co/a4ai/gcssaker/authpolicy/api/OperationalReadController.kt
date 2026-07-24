package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.time.Clock
import java.time.Instant
import java.util.concurrent.TimeUnit

@RestController
class OperationalReadController(
    private val repository: OperationalReadRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val objectMapper: ObjectMapper = ObjectMapper(),
    private val streamPolicy: OperationalReadStreamPolicy = OperationalReadStreamPolicy(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val requestReader = OperationalReadRequestReader(principalResolver)

    @GetMapping(OperationalReadApiRoutes.TELEMETRY_ALL)
    @RequiresBearerAuth
    fun telemetryAll(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<TelemetryReadResponse> {
        val principal = requestReader.principal(authorization)
        return repository.telemetryFor(principal).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.TELEMETRY_INGEST)
    @RequiresBearerAuth
    fun ingestTelemetry(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse {
        val principal = requestReader.principal(authorization)
        return repository.upsertTelemetry(request.toReadModel(principal)).toResponse()
    }

    @PostMapping(OperationalReadApiRoutes.DEVICE_TELEMETRY_INGEST)
    @RequiresBearerAuth
    fun ingestDeviceTelemetry(
        @PathVariable deviceId: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse {
        val principal = requestReader.principal(authorization)
        return repository.upsertTelemetry(
            request.toDeviceReadModel(principal, deviceId, Instant.now(clock)),
        ).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.TELEMETRY_HISTORY)
    @RequiresBearerAuth
    fun telemetryHistory(
        @PathVariable uuid: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) limit: Int?,
    ): List<TelemetryHistoryResponse> {
        val principal = requestReader.principal(authorization)
        return repository.telemetryHistoryFor(principal, uuid, requestReader.boundedLimit(limit)).map { it.toResponse() }
    }

    @GetMapping(OperationalReadApiRoutes.ASSET_BY_GATEWAY)
    @RequiresBearerAuth
    fun assetsForGateway(
        @PathVariable gatewayUuid: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<AssetReadResponse> {
        val principal = requestReader.principal(authorization)
        return repository.assetsForGateway(principal, gatewayUuid).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.SERVER_HEALTH_SNAPSHOTS)
    @RequiresBearerAuth
    fun recordServerHealthSnapshot(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: ServerHealthSnapshotRequest,
    ): ServerHealthSnapshotResponse {
        val principal = requestReader.principal(authorization)
        return repository.recordServerHealthSnapshot(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.SERVER_HEALTH_SNAPSHOTS)
    @RequiresBearerAuth
    fun serverHealthSnapshots(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) limit: Int?,
    ): List<ServerHealthSnapshotResponse> {
        val principal = requestReader.principal(authorization)
        return repository.serverHealthSnapshotsFor(principal, requestReader.boundedLimit(limit)).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.STREAM_SESSIONS)
    @RequiresBearerAuth
    fun recordStreamSession(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: StreamSessionRequest,
    ): StreamSessionResponse {
        val principal = requestReader.principal(authorization)
        return repository.recordStreamSession(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.STREAM_SESSIONS)
    @RequiresBearerAuth
    fun streamSessions(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<StreamSessionResponse> {
        val principal = requestReader.principal(authorization)
        return repository.streamSessionsFor(principal).map { it.toResponse() }
    }

    @GetMapping(OperationalReadApiRoutes.STREAM_SESSIONS_STREAM, produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    @RequiresBearerAuth
    fun streamSessionStream(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val principal = requestReader.principal(authorization)
        val stream = StreamingResponseBody { output ->
            repeat(streamPolicy.pollCount) { index ->
                output.writeOperationalReadSseEvent(
                    OperationalReadStreamContract.EVENT_STREAM_SESSIONS,
                    repository.streamSessionsFor(principal).map { it.toResponse() },
                    objectMapper,
                )
                output.writeOperationalReadSseEvent(
                    OperationalReadStreamContract.EVENT_HEARTBEAT,
                    StreamSessionHeartbeatResponse(Instant.now()),
                    objectMapper,
                )
                output.flush()
                if (index < streamPolicy.pollCount - 1 && streamPolicy.pollIntervalMillis > 0) {
                    TimeUnit.MILLISECONDS.sleep(streamPolicy.pollIntervalMillis)
                }
            }
        }
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .cacheControl(CacheControl.noStore())
            .header(OperationalReadStreamContract.HEADER_ACCEL_BUFFERING, OperationalReadStreamContract.HEADER_VALUE_NO)
            .body(stream)
    }
}
