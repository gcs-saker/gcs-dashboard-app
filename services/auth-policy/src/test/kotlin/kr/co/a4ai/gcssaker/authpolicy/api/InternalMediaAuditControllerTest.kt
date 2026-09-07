package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.MediaLifecycleAuditService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class InternalMediaAuditControllerTest {
    private val now = Instant.parse("2026-09-07T00:00:00Z")
    private val token = "internal-audit-token-with-32-characters"
    private val repository = InMemoryOperationalEventRepository(emptyList())
    private val controller = InternalMediaAuditController(MediaLifecycleAuditService(repository) { now }, token)

    @Test
    fun `authenticated lifecycle event is persisted without private route`() {
        controller.lifecycle(token, request())

        val event = repository.eventsFor(
            AuthenticatedPrincipal("admin", UserRole.ADMIN, GroupId("co-a")),
            OperationalEventQuery(query = "talkback.session.disconnected"),
        ).single()
        assertEquals("media-control", event.actorId)
        assertEquals("observed", event.result)
        assertEquals("0123456789abcdef0123456789abcdef", event.message.substringAfter("sessionRef=").substringBefore("]"))
        assertEquals(null, event.streamId)
    }

    @Test
    fun `missing or incorrect service token is rejected before persistence`() {
        assertThrows(UnauthorizedApiError::class.java) { controller.lifecycle(null, request()) }
        assertThrows(UnauthorizedApiError::class.java) { controller.lifecycle("wrong", request()) }
        assertEquals(0, repository.eventsFor(
            AuthenticatedPrincipal("admin", UserRole.ADMIN, GroupId("co-a")), OperationalEventQuery(),
        ).size)
    }

    @Test
    fun `unknown operation and raw path reference are rejected`() {
        assertThrows(BadRequestApiError::class.java) { controller.lifecycle(token, request(operation = "deploy")) }
        assertThrows(BadRequestApiError::class.java) {
            controller.lifecycle(token, request(reference = "talkback/raw/device/front/operator"))
        }
    }

    private fun request(
        operation: String = "talkback.session.disconnected",
        reference: String = "0123456789abcdef0123456789abcdef",
    ) = MediaLifecycleAuditRequest("co-a", reference, operation, now)
}
