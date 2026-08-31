package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration

interface PrincipalCache {
    fun getAccessPrincipal(accessToken: String): AuthenticatedPrincipal?
    fun putAccessPrincipal(accessToken: String, principal: AuthenticatedPrincipal, ttl: Duration)
}

object NoopPrincipalCache : PrincipalCache {
    override fun getAccessPrincipal(accessToken: String): AuthenticatedPrincipal? = null

    override fun putAccessPrincipal(
        accessToken: String,
        principal: AuthenticatedPrincipal,
        ttl: Duration,
    ) = Unit
}
