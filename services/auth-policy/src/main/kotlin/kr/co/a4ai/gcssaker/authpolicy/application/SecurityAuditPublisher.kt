package kr.co.a4ai.gcssaker.authpolicy.application

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

interface SecurityAuditPublisher {
    fun publishLoginSucceeded(principal: AuthenticatedPrincipal)
    fun publishLoginFailed(username: String)
    fun publishLogout(principal: AuthenticatedPrincipal?)
    fun publishRefreshFailed(reason: String)
    fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    )
}

object NoopSecurityAuditPublisher : SecurityAuditPublisher {
    override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) = Unit
    override fun publishLoginFailed(username: String) = Unit
    override fun publishLogout(principal: AuthenticatedPrincipal?) = Unit
    override fun publishRefreshFailed(reason: String) = Unit
    override fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    ) = Unit
}

class RepositorySecurityAuditPublisher(
    private val repository: OperationalEventRepository,
    private val now: () -> Instant = Instant::now,
) : SecurityAuditPublisher {
    private val sequence = AtomicLong()
    private val events = SecurityAuditEventFactory(sequence::incrementAndGet)

    override fun publishLoginSucceeded(principal: AuthenticatedPrincipal) {
        repository.append(events.loginSucceeded(principal, now()))
    }

    override fun publishLoginFailed(username: String) {
        repository.append(events.loginFailed(username, now()))
    }

    override fun publishLogout(principal: AuthenticatedPrincipal?) {
        repository.append(events.logout(principal, now()))
    }

    override fun publishRefreshFailed(reason: String) {
        repository.append(events.refreshFailed(reason, now()))
    }

    override fun publishStreamAccess(
        principal: AuthenticatedPrincipal,
        streamId: String,
        allowed: Boolean,
        reason: String,
    ) {
        repository.append(
            events.streamAccess(
                principal = principal,
                streamId = streamId,
                allowed = allowed,
                reason = reason,
                occurredAt = now(),
            ),
        )
    }
}
