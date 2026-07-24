package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import java.time.Instant

class TelemetryWebSocketHubTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val hub = TelemetryWebSocketHub(objectMapper)

    @Test
    fun `pushes telemetry only to subscribers in the device group`() {
        val groupA = session("a", GroupId("a"))
        val groupB = session("b", GroupId("b"))
        hub.afterConnectionEstablished(groupA)
        hub.afterConnectionEstablished(groupB)

        hub.publish(telemetry(GroupId("a")))

        val payload = ArgumentCaptor.forClass(TextMessage::class.java)
        Mockito.verify(groupA).sendMessage(payload.capture())
        Mockito.verify(groupB, Mockito.never()).sendMessage(Mockito.any())
        assertEquals("device-001", objectMapper.readTree(payload.value.payload)["uuid"].asText())
    }

    @Test
    fun `supports ten hertz push volume and removes a disconnected subscriber`() {
        val session = session("device-feed", GroupId("a"))
        hub.afterConnectionEstablished(session)

        repeat(300) { hub.publish(telemetry(GroupId("a"))) }
        Mockito.verify(session, Mockito.times(300)).sendMessage(Mockito.any())
        assertEquals(1, hub.connectionCount())

        hub.afterConnectionClosed(session, CloseStatus.NORMAL)
        hub.publish(telemetry(GroupId("a")))
        Mockito.verify(session, Mockito.times(300)).sendMessage(Mockito.any())
        assertEquals(0, hub.connectionCount())
    }

    private fun session(id: String, groupId: GroupId): WebSocketSession {
        val session = Mockito.mock(WebSocketSession::class.java)
        val principal = AuthenticatedPrincipal("viewer-$id", UserRole.VIEWER, groupId)
        Mockito.`when`(session.id).thenReturn(id)
        Mockito.`when`(session.isOpen).thenReturn(true)
        Mockito.`when`(session.principal).thenReturn(UsernamePasswordAuthenticationToken(principal, null, emptyList()))
        return session
    }

    private fun telemetry(groupId: GroupId) =
        TelemetryReadModel(
            uuid = "device-001",
            latitude = 35.8714,
            longitude = 128.6014,
            altitude = 30.0,
            magneticX = 0.0,
            magneticY = 0.0,
            magneticZ = 0.0,
            soc = "80",
            phoneBatterySOC = 80.0,
            velocity = 3.0,
            totalDistance = 10.0,
            epochTime = "00:00:00",
            portDistance = 0.0,
            groupId = groupId,
            batteryPercent = 80.0,
            observedAt = Instant.parse("2026-07-24T00:00:00Z"),
        )
}
