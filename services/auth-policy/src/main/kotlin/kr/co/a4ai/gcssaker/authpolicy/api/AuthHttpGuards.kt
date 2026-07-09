package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import java.net.URI

internal fun AuthRuntimeSettings.assertTrustedOrigin(origin: String?, referer: String?) {
    val requestOrigin = origin ?: referer?.let(::originFromReferer)
    if (requestOrigin == null || allowedOrigins.isEmpty()) {
        return
    }
    if (requestOrigin !in allowedOrigins) {
        throw ForbiddenApiError(AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN)
    }
}

internal fun assertCsrfHeader(value: String?) {
    if (value != AuthSecurityHeaders.CSRF_HEADER_VALUE) {
        throw ForbiddenApiError(AuthApiErrors.CSRF_HEADER_REQUIRED)
    }
}

internal fun refreshTokenFromCookie(
    cookies: Array<jakarta.servlet.http.Cookie>?,
    cookieName: String,
): String? =
    cookies?.firstOrNull { it.name == cookieName }?.value?.takeIf(String::isNotBlank)

internal fun bearerTokenFromAuthorization(authorization: String?): String =
    authorization?.removePrefix(AuthTokenContract.BEARER_PREFIX)?.takeIf { it != authorization }
        ?: throw UnauthorizedApiError(AuthApiErrors.AUTHENTICATION_REQUIRED)

private fun originFromReferer(referer: String): String =
    runCatching {
        URI.create(referer).let { uri -> "${uri.scheme}://${uri.authority}" }
    }.getOrElse {
        throw ForbiddenApiError(AuthApiErrors.UNTRUSTED_REQUEST_ORIGIN)
    }
