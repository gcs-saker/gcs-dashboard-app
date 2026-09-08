package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.ownGroupAccess
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import java.time.Duration

internal class AuthResponseFactory(private val settings: AuthRuntimeSettings) {
    fun tokenResponse(
        principal: AuthenticatedPrincipal,
        accessToken: String,
        refreshToken: String,
        expiresInMinutes: Long,
    ): ResponseEntity<TokenResponse> =
        ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshToken).toString())
            .cacheControl(CacheControl.noStore())
            .header(AuthResponseHeaders.PRAGMA_HEADER_NAME, AuthResponseHeaders.PRAGMA_NO_CACHE)
            .body(
                TokenResponse(
                    accessToken = accessToken,
                    expiresInMinutes = expiresInMinutes,
                    username = principal.username,
                    role = principal.role.name.lowercase(),
                    groupId = principal.groupId.value,
                    securityVersion = principal.securityVersion,
                    capabilities = principal.toCapabilitiesResponse(),
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

    private fun refreshCookie(refreshToken: String): ResponseCookie =
        ResponseCookie.from(settings.refreshCookieName, refreshToken)
            .httpOnly(true)
            .secure(settings.refreshCookieSecure)
            .sameSite(settings.refreshCookieSameSite)
            .path(AuthCookieContract.PATH)
            .maxAge(Duration.ofMinutes(settings.refreshTokenExpireMinutes))
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
