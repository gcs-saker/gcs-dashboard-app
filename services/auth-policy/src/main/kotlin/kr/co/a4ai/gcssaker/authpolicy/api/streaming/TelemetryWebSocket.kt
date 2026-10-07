package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.MeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
import kr.co.a4ai.gcssaker.authpolicy.observability.TelemetryWebSocketMetrics
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Bean
import org.springframework.security.core.Authentication
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object TelemetryWebSocketContract {
    const val PATH = "/ws/v1/telemetry"
}

class TelemetryWebSocketHub(
    private val objectMapper: ObjectMapper,
    private val hierarchyRepository: OrganizationHierarchyRepository? = null,
    private val metrics: TelemetryWebSocketMetrics = TelemetryWebSocketMetrics(),
    private val executor: ExecutorService = Executors.newVirtualThreadPerTaskExecutor(),
    private val queueCapacity: Int = DEFAULT_QUEUE_CAPACITY,
) : TextWebSocketHandler(), TelemetryPublisher, AutoCloseable {
    private val subscribers = ConcurrentHashMap<String, TelemetrySubscriber>()

    override fun afterConnectionEstablished(session: WebSocketSession) {
        val principal = (session.principal as? Authentication)?.principal as? AuthenticatedPrincipal
        if (principal == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("authenticated principal required"))
            return
        }
        val subscriber = TelemetrySubscriber(session, principal, queueCapacity, metrics) {
            removeSubscriber(session.id, CloseStatus.SERVER_ERROR, true)
        }
        subscribers.put(session.id, subscriber)?.let { previous ->
            previous.close(CloseStatus.NORMAL, true)
            metrics.disconnected()
        }
        metrics.connected()
        subscriber.start(executor)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        removeSubscriber(session.id, status, false)
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        removeSubscriber(session.id, CloseStatus.SERVER_ERROR, true)
    }

    override fun publish(telemetry: TelemetryReadModel) {
        val payload = TextMessage(objectMapper.writeValueAsString(telemetry.toResponse()))
        subscribers.values.forEach { subscriber ->
            val canViewDescendant = subscriber.principal.role == UserRole.GROUP_ADMIN &&
                hierarchyRepository?.current()?.isAncestor(subscriber.principal.groupId, telemetry.groupId) == true
            if (subscriber.principal.role == UserRole.ADMIN || subscriber.principal.groupId == telemetry.groupId || canViewDescendant) {
                if (!subscriber.offer(payload)) {
                    removeSubscriber(subscriber.session.id, BACKPRESSURE_CLOSE_STATUS, true)
                }
            }
        }
    }

    fun connectionCount(): Int = subscribers.size

    override fun close() {
        subscribers.keys.toList().forEach { removeSubscriber(it, CloseStatus.GOING_AWAY, true) }
        executor.shutdownNow()
        try {
            executor.awaitTermination(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    private fun removeSubscriber(id: String, status: CloseStatus, closeSession: Boolean) {
        subscribers.remove(id)?.let { subscriber ->
            subscriber.close(status, closeSession)
            metrics.disconnected()
        }
    }

    private companion object {
        const val DEFAULT_QUEUE_CAPACITY = 64
        const val SHUTDOWN_TIMEOUT_SECONDS = 1L
        val BACKPRESSURE_CLOSE_STATUS = CloseStatus(1013, "telemetry backpressure")
    }
}

@Configuration
class TelemetryWebSocketBeanConfig {
    @Bean
    fun telemetryWebSocketHub(
        objectMapper: ObjectMapper,
        hierarchyRepository: OrganizationHierarchyRepository,
        meterRegistry: MeterRegistry,
    ): TelemetryWebSocketHub =
        TelemetryWebSocketHub(objectMapper, hierarchyRepository, TelemetryWebSocketMetrics(meterRegistry))
}

@Configuration
@EnableWebSocket
class TelemetryWebSocketConfig(
    private val hub: TelemetryWebSocketHub,
) : WebSocketConfigurer {
    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        registry.addHandler(hub, TelemetryWebSocketContract.PATH)
    }
}
