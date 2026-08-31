package kr.co.a4ai.gcssaker.authpolicy.infrastructure.resilience

import io.github.resilience4j.circuitbreaker.CircuitBreaker
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLogContract
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalFailureLoggerFacade
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.PrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.RefreshSessionStore
import java.time.Duration

class ResilientPrincipalCache(
    private val delegate: PrincipalCache,
    private val failureLogger: OperationalFailureLoggerFacade,
    circuitBreaker: CircuitBreaker = CircuitBreaker.ofDefaults(ResilienceNames.PRINCIPAL_CACHE),
) : PrincipalCache {
    private val breaker = circuitBreaker

    override fun getAccessPrincipal(accessToken: String): AuthenticatedPrincipal? =
        runCatching {
            breaker.executeSupplier<AuthenticatedPrincipal?> {
                delegate.getAccessPrincipal(accessToken)
            }
        }.getOrElse { error ->
            failureLogger.record(
                component = OperationalFailureLogContract.COMPONENT_REDIS,
                operation = OperationalFailureLogContract.OPERATION_ACCESS_PRINCIPAL_GET,
                severity = OperationalFailureLogContract.SEVERITY_WARN,
                message = OperationalFailureLogContract.MESSAGE_PRINCIPAL_CACHE_DEGRADED,
                error = error,
            )
            null
        }

    override fun putAccessPrincipal(
        accessToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) {
        runCatching {
            breaker.executeRunnable {
                delegate.putAccessPrincipal(accessToken, principal, ttl)
            }
        }.onFailure { error ->
            failureLogger.record(
                component = OperationalFailureLogContract.COMPONENT_REDIS,
                operation = OperationalFailureLogContract.OPERATION_ACCESS_PRINCIPAL_PUT,
                severity = OperationalFailureLogContract.SEVERITY_WARN,
                message = OperationalFailureLogContract.MESSAGE_PRINCIPAL_CACHE_DEGRADED,
                error = error,
                groupId = principal.groupId,
            )
        }
    }
}

class ResilientRefreshSessionStore(
    private val delegate: RefreshSessionStore,
    private val failureLogger: OperationalFailureLoggerFacade,
    circuitBreaker: CircuitBreaker = CircuitBreaker.ofDefaults(ResilienceNames.REFRESH_SESSION),
) : RefreshSessionStore {
    private val breaker = circuitBreaker
    override val authoritative: Boolean = delegate.authoritative

    override fun putRefreshSession(
        refreshToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) {
        runCatching {
            breaker.executeRunnable {
                delegate.putRefreshSession(refreshToken, principal, ttl)
            }
        }.getOrElse { error ->
            recordRefreshFailure(OperationalFailureLogContract.OPERATION_REFRESH_SESSION_PUT, error, principal)
            throw error
        }
    }

    override fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal? =
        runCatching {
            breaker.executeSupplier<AuthenticatedPrincipal?> {
                delegate.consumeRefreshSession(refreshToken)
            }
        }.getOrElse { error ->
            recordRefreshFailure(OperationalFailureLogContract.OPERATION_REFRESH_SESSION_CONSUME, error)
            null
        }

    override fun revokeRefreshSession(refreshToken: String) {
        runCatching {
            breaker.executeRunnable {
                delegate.revokeRefreshSession(refreshToken)
            }
        }.getOrElse { error ->
            recordRefreshFailure(OperationalFailureLogContract.OPERATION_REFRESH_SESSION_REVOKE, error)
            throw error
        }
    }

    override fun revokePrincipalSessions(username: String) {
        runCatching {
            breaker.executeRunnable { delegate.revokePrincipalSessions(username) }
        }.getOrElse { error ->
            recordRefreshFailure(OperationalFailureLogContract.OPERATION_REFRESH_SESSION_REVOKE, error)
            throw error
        }
    }

    private fun recordRefreshFailure(
        operation: String,
        error: Throwable,
        principal: AuthenticatedPrincipal? = null,
    ) {
        failureLogger.record(
            component = OperationalFailureLogContract.COMPONENT_REDIS,
            operation = operation,
            severity = OperationalFailureLogContract.SEVERITY_ERROR,
            message = OperationalFailureLogContract.MESSAGE_REFRESH_SESSION_FAIL_CLOSED,
            error = error,
            groupId = principal?.groupId ?: OperationalFailureLogContract.SYSTEM_GROUP_ID,
        )
    }
}

object ResilienceNames {
    const val PRINCIPAL_CACHE = "auth-policy-principal-cache"
    const val REFRESH_SESSION = "auth-policy-refresh-session"
}
