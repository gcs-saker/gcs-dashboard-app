package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupType
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationUnit
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryWebSocketHubTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val hub = TelemetryWebSocketHub(objectMapper)

    @AfterEach
    fun closeHub() {
        hub.close()
    }

    @Test
    fun `pushes telemetry only to subscribers in the device group`() {
        val groupA = session("a", GroupId("a"))
        val groupB = session("b", GroupId("b"))
        hub.afterConnectionEstablished(groupA)
        hub.afterConnectionEstablished(groupB)

        hub.publish(telemetry(GroupId("a")))

        val payload = ArgumentCaptor.forClass(TextMessage::class.java)
        Mockito.verify(groupA, Mockito.timeout(1_000)).sendMessage(payload.capture())
        Mockito.verify(groupB, Mockito.never()).sendMessage(Mockito.any())
        assertEquals("device-001", objectMapper.readTree(payload.value.payload)["uuid"].asText())
    }

    @Test
    fun `supports ten hertz push volume and removes a disconnected subscriber`() {
        val volumeHub = TelemetryWebSocketHub(objectMapper, queueCapacity = 512)
        val session = session("device-feed", GroupId("a"))
        volumeHub.afterConnectionEstablished(session)

        repeat(300) { volumeHub.publish(telemetry(GroupId("a"))) }
        Mockito.verify(session, Mockito.timeout(2_000).times(300)).sendMessage(Mockito.any())
        assertEquals(1, volumeHub.connectionCount())

        volumeHub.afterConnectionClosed(session, CloseStatus.NORMAL)
        volumeHub.publish(telemetry(GroupId("a")))
        Mockito.verify(session, Mockito.times(300)).sendMessage(Mockito.any())
        assertEquals(0, volumeHub.connectionCount())
        volumeHub.close()
    }

    @Test
    fun `group admin receives descendant telemetry while operator and sibling do not`() {
        val root = OrganizationUnit(GroupId("root"), "Root", GroupType.BATTALION)
        val child = OrganizationUnit(GroupId("child"), "Child", GroupType.COMPANY, root.id)
        val sibling = OrganizationUnit(GroupId("sibling"), "Sibling", GroupType.COMPANY, root.id)
        val scopedHub = TelemetryWebSocketHub(
            objectMapper,
            InMemoryOrganizationHierarchyRepository(listOf(root, child, sibling)),
        )
        val groupAdmin = session("group-admin", root.id, UserRole.GROUP_ADMIN)
        val operator = session("operator", root.id, UserRole.OPERATOR)
        val siblingViewer = session("sibling", sibling.id, UserRole.VIEWER)
        scopedHub.afterConnectionEstablished(groupAdmin)
        scopedHub.afterConnectionEstablished(operator)
        scopedHub.afterConnectionEstablished(siblingViewer)

        scopedHub.publish(telemetry(child.id))

        Mockito.verify(groupAdmin, Mockito.timeout(1_000)).sendMessage(Mockito.any())
        Mockito.verify(operator, Mockito.never()).sendMessage(Mockito.any())
        Mockito.verify(siblingViewer, Mockito.never()).sendMessage(Mockito.any())
        scopedHub.close()
    }

    @Test
    fun `preserves subscriber order without blocking a healthy subscriber`() {
        val slowStarted = CountDownLatch(1)
        val releaseSlow = CountDownLatch(1)
        val slow = session("slow", GroupId("a"))
        val healthy = session("healthy", GroupId("a"))
        val healthyPayloads = CopyOnWriteArrayList<String>()
        Mockito.doAnswer {
            slowStarted.countDown()
            releaseSlow.await(1, TimeUnit.SECONDS)
            null
        }.`when`(slow).sendMessage(Mockito.any())
        Mockito.doAnswer { invocation ->
            healthyPayloads += invocation.getArgument<TextMessage>(0).payload
            null
        }.`when`(healthy).sendMessage(Mockito.any())
        val isolatedHub = TelemetryWebSocketHub(objectMapper, queueCapacity = 1)
        isolatedHub.afterConnectionEstablished(slow)
        isolatedHub.afterConnectionEstablished(healthy)

        isolatedHub.publish(telemetry(GroupId("a"), "device-001"))
        assertEquals(true, slowStarted.await(1, TimeUnit.SECONDS))
        Mockito.verify(healthy, Mockito.timeout(1_000)).sendMessage(Mockito.any())
        isolatedHub.publish(telemetry(GroupId("a"), "device-002"))
        Mockito.verify(healthy, Mockito.timeout(1_000).times(2)).sendMessage(Mockito.any())
        isolatedHub.publish(telemetry(GroupId("a"), "device-003"))
        Mockito.verify(healthy, Mockito.timeout(1_000).times(3)).sendMessage(Mockito.any())

        Mockito.verify(slow, Mockito.timeout(1_000)).close(Mockito.argThat<CloseStatus> { it.code == 1013 })
        assertEquals(1, isolatedHub.connectionCount())
        assertEquals(listOf("device-001", "device-002", "device-003"), healthyPayloads.map { objectMapper.readTree(it)["uuid"].asText() })
        releaseSlow.countDown()
        isolatedHub.close()
    }

    @Test
    fun `records queue and backpressure metrics`() {
        val registry = SimpleMeterRegistry()
        val metrics = kr.co.a4ai.gcssaker.authpolicy.observability.TelemetryWebSocketMetrics(registry)
        val slowStarted = CountDownLatch(1)
        val releaseSlow = CountDownLatch(1)
        val slow = session("metric-slow", GroupId("a"))
        Mockito.doAnswer {
            slowStarted.countDown()
            releaseSlow.await(1, TimeUnit.SECONDS)
            null
        }.`when`(slow).sendMessage(Mockito.any())
        val measuredHub = TelemetryWebSocketHub(objectMapper, metrics = metrics, queueCapacity = 1)
        measuredHub.afterConnectionEstablished(slow)
        measuredHub.publish(telemetry(GroupId("a"), "one"))
        assertEquals(true, slowStarted.await(1, TimeUnit.SECONDS))
        measuredHub.publish(telemetry(GroupId("a"), "two"))
        measuredHub.publish(telemetry(GroupId("a"), "three"))

        assertEquals(1.0, registry.counter("gcs.auth_policy.telemetry.websocket.backpressure").count())
        assertEquals(0.0, registry.get("gcs.auth_policy.telemetry.websocket.active").gauge().value())
        releaseSlow.countDown()
        measuredHub.close()
    }

    @Test
    fun `isolates a subscriber whose transport send fails`() {
        val broken = session("broken", GroupId("a"))
        val healthy = session("healthy-after-failure", GroupId("a"))
        Mockito.doThrow(IllegalStateException("socket failed")).`when`(broken).sendMessage(Mockito.any())
        val isolatedHub = TelemetryWebSocketHub(objectMapper)
        isolatedHub.afterConnectionEstablished(broken)
        isolatedHub.afterConnectionEstablished(healthy)

        isolatedHub.publish(telemetry(GroupId("a")))

        Mockito.verify(healthy, Mockito.timeout(1_000)).sendMessage(Mockito.any())
        assertTrue(waitUntil { isolatedHub.connectionCount() == 1 })
        Mockito.verify(broken, Mockito.timeout(1_000)).close(CloseStatus.SERVER_ERROR)
        isolatedHub.close()
    }

    private fun session(id: String, groupId: GroupId, role: UserRole = UserRole.VIEWER): WebSocketSession {
        val session = Mockito.mock(WebSocketSession::class.java)
        val principal = AuthenticatedPrincipal("viewer-$id", role, groupId)
        Mockito.`when`(session.id).thenReturn(id)
        Mockito.`when`(session.isOpen).thenReturn(true)
        Mockito.`when`(session.principal).thenReturn(UsernamePasswordAuthenticationToken(principal, null, emptyList()))
        return session
    }

    private fun telemetry(groupId: GroupId, uuid: String = "device-001") =
        TelemetryReadModel(
            uuid = uuid,
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

    private fun waitUntil(condition: () -> Boolean): Boolean {
        repeat(100) {
            if (condition()) return true
            Thread.sleep(10)
        }
        return false
    }
}
