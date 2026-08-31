package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.http.HttpServletRequest
import java.net.InetAddress

data class ClientIpResolution(val address: String, val trustSource: String)

/** Accepts an edge-provided address only when the direct peer matches configured CIDRs. */
class ClientIpResolver(
    private val forwardedHeader: String = "X-Real-IP",
    private val trustedProxyCidrs: List<IpCidr> = trustedProxyCidrsFromEnvironment(),
) {
    fun resolve(request: HttpServletRequest): String = resolveWithTrust(request).address

    fun resolveWithTrust(request: HttpServletRequest): ClientIpResolution {
        val direct = request.remoteAddr?.trim().orEmpty()
        if (!isTrustedProxy(direct)) return ClientIpResolution(direct.orUnknown(), TRUST_SOURCE_DIRECT)
        val forwarded = request.getHeader(forwardedHeader)?.trim().orEmpty()
        return if (isLiteralIp(forwarded)) {
            ClientIpResolution(forwarded, TRUST_SOURCE_CONFIGURED_EDGE)
        } else {
            ClientIpResolution(direct.orUnknown(), TRUST_SOURCE_INVALID_FORWARDED)
        }
    }

    private fun isTrustedProxy(value: String): Boolean =
        parseLiteralIp(value)?.let { address -> trustedProxyCidrs.any { it.contains(address) } } == true

    private fun isLiteralIp(value: String): Boolean =
        value.isNotBlank() && !value.contains(',') && parseLiteralIp(value) != null

    private fun String.orUnknown(): String = ifBlank { ApiAccessLogContract.UNKNOWN_VALUE }

    companion object {
        const val TRUSTED_PROXY_CIDRS_ENV = "AUTH_POLICY_TRUSTED_PROXY_CIDRS"
        const val TRUST_SOURCE_DIRECT = "direct_peer"
        const val TRUST_SOURCE_CONFIGURED_EDGE = "configured_edge"
        const val TRUST_SOURCE_INVALID_FORWARDED = "invalid_forwarded_header"
        private const val DEFAULT_TRUSTED_PROXY_CIDRS = "127.0.0.0/8,::1/128"

        fun trustedProxyCidrsFromEnvironment(): List<IpCidr> =
            (System.getenv(TRUSTED_PROXY_CIDRS_ENV) ?: DEFAULT_TRUSTED_PROXY_CIDRS)
                .split(',').map(String::trim).filter(String::isNotEmpty).map(IpCidr::parse)
    }
}

class IpCidr private constructor(private val network: ByteArray, private val prefixBits: Int) {
    fun contains(address: InetAddress): Boolean {
        val candidate = address.address
        if (candidate.size != network.size) return false
        val completeBytes = prefixBits / Byte.SIZE_BITS
        val remainingBits = prefixBits % Byte.SIZE_BITS
        if (!candidate.copyOfRange(0, completeBytes).contentEquals(network.copyOfRange(0, completeBytes))) return false
        if (remainingBits == 0) return true
        val mask = 0xff shl (Byte.SIZE_BITS - remainingBits) and 0xff
        return (candidate[completeBytes].toInt() and mask) == (network[completeBytes].toInt() and mask)
    }

    companion object {
        fun parse(value: String): IpCidr {
            val parts = value.split('/', limit = 2)
            require(parts.size == 2) { "trusted proxy CIDR must include a prefix" }
            val address = parseLiteralIp(parts[0]) ?: error("trusted proxy CIDR must use a literal IP")
            val prefixBits = parts[1].toIntOrNull() ?: error("trusted proxy CIDR prefix is invalid")
            require(prefixBits in 0..(address.address.size * Byte.SIZE_BITS)) { "trusted proxy CIDR prefix is invalid" }
            return IpCidr(address.address, prefixBits)
        }
    }
}

private fun parseLiteralIp(value: String): InetAddress? {
    val isIpv4 = value.count { it == '.' } == 3 && value.all { it.isDigit() || it == '.' }
    val isIpv6 = value.contains(':') && value.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' || it == ':' || it == '.' }
    if (!isIpv4 && !isIpv6) return null
    return runCatching { InetAddress.getByName(value) }.getOrNull()
}
