package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.ServerHealthSnapshotReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.StreamSessionReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryHistoryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import java.time.Instant

internal fun TelemetryIngestRequest.toReadModel(principal: AuthenticatedPrincipal): TelemetryReadModel {
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
        batteryPercent = batteryPercent,
        rollDeg = rollDeg,
        pitchDeg = pitchDeg,
        yawDeg = yawDeg,
        linkQualityPercent = linkQualityPercent,
        observedAt = observedUnixMillis?.let(Instant::ofEpochMilli),
    )
}

internal fun TelemetryIngestRequest.toDeviceReadModel(
    principal: AuthenticatedPrincipal,
    deviceId: String,
    now: Instant,
): TelemetryReadModel {
    val normalizedDeviceId = deviceId.trim().takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.UUID_REQUIRED)
    val bodyUuid = uuid?.trim()?.takeIf { it.isNotEmpty() }
    if (bodyUuid != null && bodyUuid != normalizedDeviceId) {
        throw BadRequestApiError(OperationalReadApiErrors.DEVICE_ID_MISMATCH)
    }
    val observed = observedUnixMillis
        ?: throw BadRequestApiError(OperationalReadApiErrors.OBSERVED_TIMESTAMP_REQUIRED)
    if (observed <= 0) {
        throw BadRequestApiError(OperationalReadApiErrors.OBSERVED_TIMESTAMP_INVALID)
    }
    if (observed > now.toEpochMilli() + TelemetryIngestPolicy.MAX_FUTURE_SKEW_MILLIS) {
        throw BadRequestApiError(OperationalReadApiErrors.OBSERVED_TIMESTAMP_IN_FUTURE)
    }
    return copy(
        uuid = normalizedDeviceId,
        epochTime = (observed / 1_000) % SECONDS_PER_DAY,
    ).toReadModel(principal)
}

internal fun ServerHealthSnapshotRequest.toReadModel(
    principal: AuthenticatedPrincipal,
): ServerHealthSnapshotReadModel {
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

internal fun StreamSessionRequest.toReadModel(principal: AuthenticatedPrincipal): StreamSessionReadModel {
    val normalizedStreamId = streamId?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.STREAM_ID_REQUIRED)
    val normalizedStatus = status?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestApiError(OperationalReadApiErrors.STATUS_REQUIRED)
    val heartbeatAt = lastHeartbeatAt ?: Instant.now()
    return StreamSessionReadModel(
        streamId = normalizedStreamId,
        sessionId = sessionId?.trim()?.takeIf { it.isNotEmpty() },
        status = normalizedStatus,
        source = source?.trim()?.takeIf { it.isNotEmpty() }
            ?: OperationalReadStatusContract.STREAM_SESSION_SOURCE_MEDIA_CONTROL,
        startedAt = startedAt ?: heartbeatAt,
        lastHeartbeatAt = heartbeatAt,
        stoppedAt = stoppedAt,
        groupId = GroupId(principal.groupId.value),
    )
}

internal fun TelemetryReadModel.toResponse(): TelemetryReadResponse =
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
        batteryPercent = batteryPercent,
        rollDeg = rollDeg,
        pitchDeg = pitchDeg,
        yawDeg = yawDeg,
        linkQualityPercent = linkQualityPercent,
        observedAt = observedAt,
    )

internal fun TelemetryHistoryReadModel.toResponse(): TelemetryHistoryResponse =
    TelemetryHistoryResponse(recordedAt = recordedAt, telemetry = telemetry.toResponse())

internal fun AssetReadModel.toResponse(): AssetReadResponse =
    AssetReadResponse(id, cid, uuid, companyId, type, name, description, imageUrl, status, createdAt, updatedAt)

internal fun ServerHealthSnapshotReadModel.toResponse(): ServerHealthSnapshotResponse =
    ServerHealthSnapshotResponse(serviceName, status, checkedAt, latencyMs, message)

internal fun StreamSessionReadModel.toResponse(): StreamSessionResponse =
    StreamSessionResponse(streamId, sessionId, status, source, startedAt, lastHeartbeatAt, stoppedAt)

private fun formatEpochTime(epochTime: Long?): String {
    val seconds = epochTime ?: 0L
    val hours = seconds / SECONDS_PER_HOUR
    val minutes = (seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
    val remainingSeconds = seconds % SECONDS_PER_MINUTE
    return "%02d:%02d:%02d".format(hours, minutes, remainingSeconds)
}

private const val SECONDS_PER_HOUR = 3_600
private const val SECONDS_PER_MINUTE = 60
private const val SECONDS_PER_DAY = 86_400
