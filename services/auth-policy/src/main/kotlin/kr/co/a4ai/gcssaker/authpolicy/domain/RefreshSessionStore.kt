package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration

interface RefreshSessionStore {
    val authoritative: Boolean

    fun putRefreshSession(refreshToken: String, principal: AuthenticatedPrincipal, ttl: Duration)
    fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal?
    fun revokeRefreshSession(refreshToken: String)
}

object StatelessRefreshSessionStore : RefreshSessionStore {
    override val authoritative: Boolean = false

    override fun putRefreshSession(
        refreshToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) = Unit

    override fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal? = null

    override fun revokeRefreshSession(refreshToken: String) = Unit
}
