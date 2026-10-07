package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.observability.TelemetryWebSocketMetrics
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ExecutorService
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

internal class TelemetrySubscriber(
    val session: WebSocketSession,
    val principal: AuthenticatedPrincipal,
    capacity: Int,
    private val metrics: TelemetryWebSocketMetrics,
    private val onFailure: () -> Unit,
) {
    private val queue = ArrayBlockingQueue<TextMessage>(capacity)
    private val closed = AtomicBoolean()
    @Volatile private var task: Future<*>? = null

    init {
        require(capacity > 0) { "telemetry subscriber queue capacity must be positive" }
    }

    @Synchronized
    fun start(executor: ExecutorService) {
        if (closed.get()) return
        task = executor.submit(::sendQueuedMessages)
    }

    @Synchronized
    fun offer(message: TextMessage): Boolean {
        if (closed.get()) return false
        if (!queue.offer(message)) {
            metrics.backpressured()
            return false
        }
        metrics.queued()
        return true
    }

    @Synchronized
    fun close(status: CloseStatus, closeSession: Boolean) {
        if (!closed.compareAndSet(false, true)) return
        task?.cancel(true)
        metrics.discarded(queue.size)
        queue.clear()
        if (closeSession && session.isOpen) runCatching { session.close(status) }
    }

    private fun sendQueuedMessages() {
        try {
            while (!closed.get()) send(queue.take())
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (_: Exception) {
            metrics.failed()
            onFailure()
        }
    }

    private fun send(message: TextMessage) {
        metrics.dequeued()
        if (!session.isOpen) {
            onFailure()
            return
        }
        synchronized(session) {
            if (!session.isOpen) {
                onFailure()
                return
            }
            session.sendMessage(message)
        }
        metrics.sent()
    }
}
