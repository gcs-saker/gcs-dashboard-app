package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.OrganizationHierarchyRepository
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

object TelemetryWebSocketContract {
    const val PATH = "/ws/v1/telemetry"
}

class TelemetryWebSocketHub(
    private val objectMapper: ObjectMapper,
    private val hierarchyRepository: OrganizationHierarchyRepository? = null,
) : TextWebSocketHandler(), TelemetryPublisher {
    private data class Subscriber(
        val session: WebSocketSession,
        val principal: AuthenticatedPrincipal,
    )

    private val subscribers = ConcurrentHashMap<String, Subscriber>()

    override fun afterConnectionEstablished(session: WebSocketSession) {
        val principal = (session.principal as? Authentication)?.principal as? AuthenticatedPrincipal
        if (principal == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("authenticated principal required"))
            return
        }
        subscribers[session.id] = Subscriber(session, principal)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        subscribers.remove(session.id)
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        subscribers.remove(session.id)
        if (session.isOpen) session.close(CloseStatus.SERVER_ERROR)
    }

    override fun publish(telemetry: TelemetryReadModel) {
        val payload = TextMessage(objectMapper.writeValueAsString(telemetry.toResponse()))
        subscribers.values.forEach { subscriber ->
            val canViewDescendant = subscriber.principal.role == UserRole.OPERATOR &&
                hierarchyRepository?.current()?.isAncestor(subscriber.principal.groupId, telemetry.groupId) == true
            if (subscriber.principal.role == UserRole.ADMIN || subscriber.principal.groupId == telemetry.groupId || canViewDescendant) {
                runCatching {
                    synchronized(subscriber.session) {
                        if (subscriber.session.isOpen) subscriber.session.sendMessage(payload)
                    }
                }.onFailure {
                    subscribers.remove(subscriber.session.id)
                }
            }
        }
    }

    fun connectionCount(): Int = subscribers.size
}

@Configuration
class TelemetryWebSocketBeanConfig {
    @Bean
    fun telemetryWebSocketHub(
        objectMapper: ObjectMapper,
        hierarchyRepository: OrganizationHierarchyRepository,
    ): TelemetryWebSocketHub = TelemetryWebSocketHub(objectMapper, hierarchyRepository)
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
