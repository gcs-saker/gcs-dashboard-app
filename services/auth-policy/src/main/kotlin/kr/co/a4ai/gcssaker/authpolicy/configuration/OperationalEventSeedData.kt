package kr.co.a4ai.gcssaker.authpolicy.configuration

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import java.time.Instant

internal fun seedOperationalEvents(): List<OperationalEventReadModel> {
    val group = GroupId(SAMPLE_GROUP_ID)
    return listOf(
        OperationalEventReadModel(
            id = "ops-health-001",
            occurredAt = Instant.parse(SAMPLE_TIMESTAMP),
            severity = "info",
            category = "api",
            source = "API 서버",
            message = "헬스체크 정상",
            connections = 12,
            latencyMs = 42,
            throughputMbps = 18.4,
            groupId = group,
        ),
        signalingConnectedEvent(group),
        relayFallbackEvent(group),
        streamDisconnectedEvent(group),
        expiredSessionEvent(group),
    )
}

private fun signalingConnectedEvent(group: GroupId): OperationalEventReadModel =
    OperationalEventReadModel(
        id = "ops-signaling-001",
        occurredAt = Instant.parse("2026-06-01T00:05:00Z"),
        severity = "info",
        category = "signaling",
        eventType = "webrtc.connected",
        sourceService = "mediamtx",
        source = "Signaling 서버",
        message = "WebRTC WHEP 연결 수립",
        connections = 3,
        latencyMs = 88,
        throughputMbps = 42.1,
        groupId = group,
        streamId = SAMPLE_STREAM_ID,
        connectionId = SAMPLE_CONNECTION_ID,
        icePath = "srflx",
    )

private fun relayFallbackEvent(group: GroupId): OperationalEventReadModel =
    OperationalEventReadModel(
        id = "ops-network-001",
        occurredAt = Instant.parse("2026-06-01T00:12:00Z"),
        severity = "warn",
        category = "network",
        eventType = "ice.relay_fallback",
        sourceService = "turn",
        source = "TURN 릴레이",
        message = "직접 ICE 후보 실패 후 릴레이 경로 사용",
        connections = 5,
        latencyMs = 164,
        throughputMbps = 31.6,
        groupId = group,
        streamId = SAMPLE_STREAM_ID,
        connectionId = SAMPLE_CONNECTION_ID,
        icePath = "relay",
        relayFallbackReason = "srflx candidate failed",
    )

private fun streamDisconnectedEvent(group: GroupId): OperationalEventReadModel =
    OperationalEventReadModel(
        id = "ops-stream-001",
        occurredAt = Instant.parse("2026-06-01T00:24:00Z"),
        severity = "warn",
        category = "stream",
        eventType = "stream.disconnected",
        sourceService = "media-control",
        source = "Stream Registry",
        message = "송출 종료 감지",
        connections = 1,
        latencyMs = 110,
        throughputMbps = 0.0,
        groupId = group,
        streamId = SAMPLE_STREAM_ID,
        connectionId = SAMPLE_CONNECTION_ID,
    )

private fun expiredSessionEvent(group: GroupId): OperationalEventReadModel =
    OperationalEventReadModel(
        id = "ops-security-001",
        occurredAt = Instant.parse("2026-06-01T00:31:00Z"),
        severity = "error",
        category = "security",
        source = "인증/인가 서버",
        message = "만료된 세션으로 스트림 접근 거절",
        connections = 0,
        latencyMs = 73,
        throughputMbps = 0.0,
        groupId = group,
    )

private const val SAMPLE_GROUP_ID = "co-a"
private const val SAMPLE_TIMESTAMP = "2026-06-01T00:00:00Z"
private const val SAMPLE_STREAM_ID = "raw/local/webcam"
private const val SAMPLE_CONNECTION_ID = "conn-whep-001"
