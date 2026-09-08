package kr.co.a4ai.gcssaker.authpolicy.api

object AuthSecurityHeaders {
    const val AUTHORIZATION_HEADER_NAME = "Authorization"
    const val CSRF_HEADER_NAME = "X-GCS-CSRF"
    const val CSRF_HEADER_VALUE = "same-origin"
}

object AuthTokenContract {
    const val BEARER_PREFIX = "Bearer "
    const val BEARER_TOKEN_TYPE = "bearer"
}

object AuthResponseHeaders {
    const val PRAGMA_HEADER_NAME = "Pragma"
    const val PRAGMA_NO_CACHE = "no-cache"
}

object AuthCookieContract {
    const val PATH = "/"
    const val EMPTY_VALUE = ""
}

object AuthRoleDefaults {
    const val SIGNUP_ROLE = "viewer"
}

object AuthApiErrors {
    const val INVALID_CREDENTIALS = "Invalid credentials"
    const val REFRESH_TOKEN_REQUIRED = "refresh token required"
    const val INVALID_TOKEN = "invalid token"
    const val AUTHENTICATION_REQUIRED = "authentication required"
    const val UNTRUSTED_REQUEST_ORIGIN = "untrusted request origin"
    const val CSRF_HEADER_REQUIRED = "csrf header required"
    const val SIGNUP_REJECTED = "signup rejected"
    const val INVALID_SIGNUP_REQUEST = "invalid signup request"
}
