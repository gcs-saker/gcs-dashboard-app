package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.SecurityAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgement
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalAlertAcknowledgementRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.mock.web.MockHttpServletRequest

class OperationalAlertAcknowledgementControllerTest {
    private val principals = Mockito.mock(BearerPrincipalResolver::class.java)
    private val audit = RecordingSecurityAuditPublisher()
    private val repository = InMemoryAcknowledgementRepository()
    private val controller = OperationalAlertAcknowledgementController(principals, audit, repository)

    @Test
    fun `system administrator records a bounded alert transition`() {
        Mockito.`when`(principals.requirePrincipal("Bearer admin")).thenReturn(
            AuthenticatedPrincipal("admin01", UserRole.ADMIN, GroupId("co-a")),
        )

        val response = controller.acknowledge(
            "Bearer admin", OperationalAlertAcknowledgementRequest("RUN-PUB-01", "IN_PROGRESS"),
            MockHttpServletRequest().apply { remoteAddr = "127.0.0.1" },
        )

        assertEquals("RUN-PUB-01", response.runbookId)
        assertEquals("in_progress", response.state)
        assertEquals("operational.alert.in_progress", audit.action)
        assertEquals("RUN-PUB-01", audit.target)
        assertEquals(response, controller.list("Bearer admin").single())
    }

    @Test
    fun `non administrator and unknown values are rejected`() {
        Mockito.`when`(principals.requirePrincipal("Bearer operator")).thenReturn(
            AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a")),
        )
        val request = MockHttpServletRequest()
        assertThrows(ForbiddenApiError::class.java) {
            controller.acknowledge("Bearer operator", OperationalAlertAcknowledgementRequest("RUN-PUB-01", "acknowledged"), request)
        }
        Mockito.`when`(principals.requirePrincipal("Bearer admin")).thenReturn(
            AuthenticatedPrincipal("admin01", UserRole.ADMIN, GroupId("co-a")),
        )
        assertThrows(BadRequestApiError::class.java) {
            controller.acknowledge("Bearer admin", OperationalAlertAcknowledgementRequest("RUN-PRIVATE", "resolved"), request)
        }
    }
}

private class InMemoryAcknowledgementRepository : OperationalAlertAcknowledgementRepository {
    private val values = linkedMapOf<String, OperationalAlertAcknowledgement>()
    override fun save(value: OperationalAlertAcknowledgement): OperationalAlertAcknowledgement = value.also {
        values[value.runbookId] = value
    }
    override fun list(): List<OperationalAlertAcknowledgement> = values.values.toList()
}

private class RecordingSecurityAuditPublisher : SecurityAuditPublisher {
    var action: String? = null
    var target: String? = null
    override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) = Unit
    override fun publishLoginFailed(username: String) = Unit
    override fun publishLogout(principal: AuthenticatedPrincipal?) = Unit
    override fun publishRefreshFailed(reason: String) = Unit
    override fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        publisherGroupId: GroupId,
        allowed: Boolean,
        reason: String,
    ) = Unit
    override fun publishGroupManagement(
        principal: AuthenticatedPrincipal,
        targetGroupId: GroupId,
        action: String,
        target: String,
        clientIp: String,
    ) {
        this.action = action
        this.target = target
    }
}
