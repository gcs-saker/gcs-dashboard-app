package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.IssuedTokenSet
import kr.co.a4ai.gcssaker.authpolicy.domain.ownGroupAccess
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import java.time.Duration

internal class AuthResponseFactory(private val settings: AuthRuntimeSettings) {
    fun tokenResponse(tokens: IssuedTokenSet): ResponseEntity<TokenResponse> =
        ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(tokens).toString())
            .cacheControl(CacheControl.noStore())
            .header(AuthResponseHeaders.PRAGMA_HEADER_NAME, AuthResponseHeaders.PRAGMA_NO_CACHE)
            .body(
                TokenResponse(
                    accessToken = tokens.accessToken,
                    expiresInMinutes = tokens.expiresInMinutes,
                    username = tokens.principal.username,
                    role = tokens.principal.role.name.lowercase(),
                    groupId = tokens.principal.groupId.value,
                    securityVersion = tokens.principal.securityVersion,
                    capabilities = tokens.principal.toCapabilitiesResponse(),
                ),
            )

    fun unauthorizedWithClearedRefreshCookie(): ResponseEntity<TokenResponse> =
        ResponseEntity.status(org.springframework.http.HttpStatus.UNAUTHORIZED)
            .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
            .cacheControl(CacheControl.noStore())
            .header(AuthResponseHeaders.PRAGMA_HEADER_NAME, AuthResponseHeaders.PRAGMA_NO_CACHE)
            .build()

    fun logoutResponse(): ResponseEntity<Void> =
        ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
            .build()

    fun userResponse(user: AuthUser): UserResponse =
        UserResponse(
            id = user.id,
            username = user.username,
            email = user.email,
            companyId = user.companyId,
            role = user.role.name.lowercase(),
        )

    private fun refreshCookie(tokens: IssuedTokenSet): ResponseCookie =
        ResponseCookie.from(settings.refreshCookieName, tokens.refreshToken)
            .httpOnly(true)
            .secure(settings.refreshCookieSecure)
            .sameSite(settings.refreshCookieSameSite)
            .path(AuthCookieContract.PATH)
            .maxAge(Duration.ofSeconds(tokens.refreshExpiresInSeconds))
            .build()

    private fun clearRefreshCookie(): ResponseCookie =
        ResponseCookie.from(settings.refreshCookieName, AuthCookieContract.EMPTY_VALUE)
            .httpOnly(true)
            .secure(settings.refreshCookieSecure)
            .sameSite(settings.refreshCookieSameSite)
            .path(AuthCookieContract.PATH)
            .maxAge(Duration.ZERO)
            .build()
}

internal fun AuthenticatedPrincipal.toCapabilitiesResponse(): GroupCapabilitiesResponse {
    val access = ownGroupAccess(this)
    return GroupCapabilitiesResponse(
        canView = access.canView,
        canControl = access.canControl,
        canManage = access.canManage,
        canSendTalkback = access.canSendTalkback,
        canPublish = access.canPublish,
        canManageMembers = access.canManageMembers,
        canManageDevices = access.canManageDevices,
    )
}
