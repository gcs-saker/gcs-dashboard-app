package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import java.net.InetAddress

/** Resolves one edge-provided address only when the direct peer is a trusted internal proxy. */
class ClientIpResolver(
    private val forwardedHeader: String = "X-Real-IP",
) {
    fun resolve(request: HttpServletRequest): String {
        val direct = request.remoteAddr?.trim().orEmpty()
        if (!isTrustedProxy(direct)) return direct.ifBlank { ApiAccessLogContract.UNKNOWN_VALUE }
        val forwarded = request.getHeader(forwardedHeader)?.trim().orEmpty()
        return forwarded.takeIf(::isLiteralIp) ?: direct.ifBlank { ApiAccessLogContract.UNKNOWN_VALUE }
    }

    private fun isTrustedProxy(value: String): Boolean = runCatching {
        InetAddress.getByName(value).let { it.isLoopbackAddress || it.isSiteLocalAddress }
    }.getOrDefault(false)

    private fun isLiteralIp(value: String): Boolean =
        value.isNotBlank() && !value.contains(',') &&
            (value.all { it.isDigit() || it == '.' } || value.contains(':')) &&
            runCatching { InetAddress.getByName(value) }.isSuccess
}
