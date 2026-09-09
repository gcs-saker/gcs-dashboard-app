package kr.co.a4ai.gcssaker.authpolicy.domain

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.Clock
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

fun interface RecoveryCodeStore {
    fun consume(codeHash: String): Boolean
}

fun interface AdminMfaVerifier {
    fun verify(principal: AuthenticatedPrincipal, code: String?): Boolean
}

object MfaDisabled : AdminMfaVerifier {
    override fun verify(principal: AuthenticatedPrincipal, code: String?) = true
}

class TotpAdminMfaVerifier(
    secretBase32: String,
    recoveryHashes: Set<String>,
    private val recoveryCodes: RecoveryCodeStore,
    private val clock: Clock = Clock.systemUTC(),
) : AdminMfaVerifier {
    private val secret = decodeBase32(secretBase32)
    private val approvedRecoveryHashes = recoveryHashes.map(String::lowercase).toSet()

    init {
        require(secret.size >= 20) { "admin MFA secret must contain at least 160 bits" }
        require(approvedRecoveryHashes.size >= 2) { "at least two admin recovery codes are required" }
        require(approvedRecoveryHashes.all { it.matches(Regex("[0-9a-f]{64}")) }) {
            "admin recovery codes must be SHA-256 hashes"
        }
    }

    override fun verify(principal: AuthenticatedPrincipal, code: String?): Boolean {
        if (principal.role != UserRole.ADMIN) return true
        val supplied = code?.trim().orEmpty()
        if (supplied.matches(Regex("[0-9]{6}"))) return verifyTotp(principal.username, supplied)
        val hash = sha256(supplied)
        return hash in approvedRecoveryHashes && recoveryCodes.consume(hash)
    }

    private fun verifyTotp(username: String, supplied: String): Boolean {
        val currentCounter = clock.instant().epochSecond / 30
        return (-1L..1L).any { offset ->
            val counter = currentCounter + offset
            val matches = MessageDigest.isEqual(totp(counter).toByteArray(), supplied.toByteArray())
            matches && recoveryCodes.consume(sha256("totp:$username:$counter"))
        }
    }

    private fun totp(counter: Long): String {
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(secret, "HmacSHA1"))
        val digest = mac.doFinal(ByteBuffer.allocate(Long.SIZE_BYTES).putLong(counter).array())
        val offset = digest.last().toInt() and 0x0f
        val binary = ByteBuffer.wrap(digest, offset, 4).int and 0x7fffffff
        return (binary % 1_000_000).toString().padStart(6, '0')
    }
}

private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

private fun decodeBase32(value: String): ByteArray {
    val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    var buffer = 0
    var bits = 0
    val output = mutableListOf<Byte>()
    value.uppercase().filterNot(Char::isWhitespace).trimEnd('=').forEach { character ->
        val index = alphabet.indexOf(character)
        require(index >= 0) { "admin MFA secret is not valid Base32" }
        buffer = (buffer shl 5) or index
        bits += 5
        if (bits >= 8) {
            bits -= 8
            output += ((buffer shr bits) and 0xff).toByte()
        }
    }
    return output.toByteArray()
}
