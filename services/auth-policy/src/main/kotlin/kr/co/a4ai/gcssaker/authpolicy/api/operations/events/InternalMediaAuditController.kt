package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.application.MediaLifecycleAuditCommand
import kr.co.a4ai.gcssaker.authpolicy.application.MediaLifecycleAuditService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.security.MessageDigest
import java.time.Instant

@RestController
@RequestMapping(InternalMediaAuditRoutes.ROOT)
class InternalMediaAuditController(
    private val audit: MediaLifecycleAuditService,
    @param:Value("\${AUTH_POLICY_AUDIT_INGEST_TOKEN:}") private val expectedToken: String,
) {
    @PostMapping(InternalMediaAuditRoutes.LIFECYCLE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun lifecycle(
        @RequestHeader(InternalMediaAuditRoutes.TOKEN_HEADER, required = false) token: String?,
        @RequestBody request: MediaLifecycleAuditRequest,
    ) {
        if (!validToken(token)) throw UnauthorizedApiError("internal audit authentication required")
        try {
            audit.record(MediaLifecycleAuditCommand(request.groupId, request.sessionReference, request.operation, request.occurredAt))
        } catch (error: IllegalArgumentException) {
            throw BadRequestApiError(error.message ?: "invalid media lifecycle event")
        }
    }

    private fun validToken(supplied: String?): Boolean = expectedToken.length >= MINIMUM_TOKEN_LENGTH &&
        MessageDigest.isEqual(expectedToken.toByteArray(), supplied.orEmpty().toByteArray())

    private companion object {
        const val MINIMUM_TOKEN_LENGTH = 32
    }
}

data class MediaLifecycleAuditRequest(
    val groupId: String,
    val sessionReference: String,
    val operation: String,
    val occurredAt: Instant,
)

object InternalMediaAuditRoutes {
    const val ROOT = "/internal/v1/audit"
    const val LIFECYCLE = "/media-lifecycle"
    const val TOKEN_HEADER = "X-GCS-Internal-Token"
}
