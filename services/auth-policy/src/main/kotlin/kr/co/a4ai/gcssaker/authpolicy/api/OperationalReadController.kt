package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
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
import java.time.Instant
import java.util.concurrent.TimeUnit

@RestController
class OperationalReadController(
    private val repository: OperationalReadRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val objectMapper: ObjectMapper = ObjectMapper(),
    private val streamPolicy: OperationalReadStreamPolicy = OperationalReadStreamPolicy(),
) {
    @GetMapping(OperationalReadApiRoutes.TELEMETRY_ALL)
    @RequiresBearerAuth
    fun telemetryAll(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<TelemetryReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.telemetryFor(principal).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.TELEMETRY_INGEST)
    @RequiresBearerAuth
    fun ingestTelemetry(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: TelemetryIngestRequest,
    ): TelemetryReadResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.upsertTelemetry(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.TELEMETRY_HISTORY)
    @RequiresBearerAuth
    fun telemetryHistory(
        @PathVariable uuid: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) limit: Int?,
    ): List<TelemetryHistoryResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.telemetryHistoryFor(principal, uuid, limit?.coerceIn(1, 500) ?: 100).map { it.toResponse() }
    }

    @GetMapping(OperationalReadApiRoutes.ASSET_BY_GATEWAY)
    @RequiresBearerAuth
    fun assetsForGateway(
        @PathVariable gatewayUuid: String,
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<AssetReadResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.assetsForGateway(principal, gatewayUuid).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.SERVER_HEALTH_SNAPSHOTS)
    @RequiresBearerAuth
    fun recordServerHealthSnapshot(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: ServerHealthSnapshotRequest,
    ): ServerHealthSnapshotResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.recordServerHealthSnapshot(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.SERVER_HEALTH_SNAPSHOTS)
    @RequiresBearerAuth
    fun serverHealthSnapshots(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) limit: Int?,
    ): List<ServerHealthSnapshotResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.serverHealthSnapshotsFor(principal, limit?.coerceIn(1, 500) ?: 100).map { it.toResponse() }
    }

    @PostMapping(OperationalReadApiRoutes.STREAM_SESSIONS)
    @RequiresBearerAuth
    fun recordStreamSession(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestBody request: StreamSessionRequest,
    ): StreamSessionResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.recordStreamSession(request.toReadModel(principal)).toResponse()
    }

    @GetMapping(OperationalReadApiRoutes.STREAM_SESSIONS)
    @RequiresBearerAuth
    fun streamSessions(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): List<StreamSessionResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        return repository.streamSessionsFor(principal).map { it.toResponse() }
    }

    @GetMapping(OperationalReadApiRoutes.STREAM_SESSIONS_STREAM, produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    @RequiresBearerAuth
    fun streamSessionStream(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val principal = principalResolver.requirePrincipal(authorization)
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

private fun TelemetryIngestRequest.toReadModel(principal: AuthenticatedPrincipal): TelemetryReadModel {
    val telemetryUuid = uuid?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.UUID_REQUIRED)
    return TelemetryReadModel(
        uuid = telemetryUuid,
        latitude = latitude ?: 0.0,
        longitude = longitude ?: 0.0,
        altitude = altitude ?: 0.0,
        magneticX = magneticX ?: 0.0,
        magneticY = magneticY ?: 0.0,
        magneticZ = magneticZ ?: 0.0,
        soc = soc ?: "0",
        phoneBatterySOC = phoneBatterySOC ?: 0.0,
        velocity = velocity ?: 0.0,
        totalDistance = totalDistance ?: 0.0,
        epochTime = formatEpochTime(epochTime),
        portDistance = portDistance ?: 0.0,
        groupId = GroupId(principal.groupId.value),
    )
}

private fun ServerHealthSnapshotRequest.toReadModel(principal: AuthenticatedPrincipal): ServerHealthSnapshotReadModel {
    val normalizedServiceName = serviceName?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.SERVICE_NAME_REQUIRED)
    val normalizedStatus = status?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.STATUS_REQUIRED)
    return ServerHealthSnapshotReadModel(
        serviceName = normalizedServiceName,
        status = normalizedStatus,
        checkedAt = checkedAt ?: Instant.now(),
        latencyMs = latencyMs?.coerceAtLeast(0),
        message = message?.trim()?.takeIf { it.isNotEmpty() },
        groupId = GroupId(principal.groupId.value),
    )
}

private fun StreamSessionRequest.toReadModel(principal: AuthenticatedPrincipal): StreamSessionReadModel {
    val normalizedStreamId = streamId?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.STREAM_ID_REQUIRED)
    val normalizedStatus = status?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.STATUS_REQUIRED)
    val heartbeatAt = lastHeartbeatAt ?: Instant.now()
    return StreamSessionReadModel(
        streamId = normalizedStreamId,
        sessionId = sessionId?.trim()?.takeIf { it.isNotEmpty() },
        status = normalizedStatus,
        source = source?.trim()?.takeIf { it.isNotEmpty() } ?: OperationalReadDefaults.STREAM_SESSION_SOURCE,
        startedAt = startedAt ?: heartbeatAt,
        lastHeartbeatAt = heartbeatAt,
        stoppedAt = stoppedAt,
        groupId = GroupId(principal.groupId.value),
    )
}

private fun formatEpochTime(epochTime: Long?): String {
    val seconds = epochTime ?: 0L
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val remainingSeconds = seconds % 60
    return "%02d:%02d:%02d".format(hours, minutes, remainingSeconds)
}

private fun TelemetryReadModel.toResponse(): TelemetryReadResponse =
    TelemetryReadResponse(
        uuid = uuid,
        latitude = latitude,
        longitude = longitude,
        altitude = altitude,
        magneticX = magneticX,
        magneticY = magneticY,
        magneticZ = magneticZ,
        soc = soc,
        phoneBatterySOC = phoneBatterySOC,
        velocity = velocity,
        totalDistance = totalDistance,
        epochTime = epochTime,
        portDistance = portDistance,
    )

private fun TelemetryHistoryReadModel.toResponse(): TelemetryHistoryResponse =
    TelemetryHistoryResponse(
        recordedAt = recordedAt,
        telemetry = telemetry.toResponse(),
    )

private fun AssetReadModel.toResponse(): AssetReadResponse =
    AssetReadResponse(
        id = id,
        cid = cid,
        uuid = uuid,
        companyId = companyId,
        type = type,
        name = name,
        description = description,
        imageUrl = imageUrl,
        status = status,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun ServerHealthSnapshotReadModel.toResponse(): ServerHealthSnapshotResponse =
    ServerHealthSnapshotResponse(
        serviceName = serviceName,
        status = status,
        checkedAt = checkedAt,
        latencyMs = latencyMs,
        message = message,
    )

private fun StreamSessionReadModel.toResponse(): StreamSessionResponse =
    StreamSessionResponse(
        streamId = streamId,
        sessionId = sessionId,
        status = status,
        source = source,
        startedAt = startedAt,
        lastHeartbeatAt = lastHeartbeatAt,
        stoppedAt = stoppedAt,
    )

private fun java.io.OutputStream.writeOperationalReadSseEvent(eventName: String, payload: Any, objectMapper: ObjectMapper) {
    write("${OperationalReadStreamContract.FIELD_EVENT}: $eventName\n".toByteArray(Charsets.UTF_8))
    write("${OperationalReadStreamContract.FIELD_DATA}: ${objectMapper.writeValueAsString(payload)}\n\n".toByteArray(Charsets.UTF_8))
}

private object OperationalReadDefaults {
    const val STREAM_SESSION_SOURCE = "media-control"
}
