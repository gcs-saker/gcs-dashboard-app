package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class PasswordHasher(
    private val iterations: Int = 210_000,
    private val keyLength: Int = 256,
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    fun hash(password: String): String {
        require(password.isNotBlank()) { "password must not be blank" }
        val salt = ByteArray(16)
        secureRandom.nextBytes(salt)
        val derived = derive(password, salt)
        return listOf(
            "pbkdf2-sha256",
            iterations.toString(),
            Base64.getEncoder().encodeToString(salt),
            Base64.getEncoder().encodeToString(derived),
        ).joinToString("$")
    }

    fun verify(password: String, encoded: String): Boolean {
        val parts = encoded.split("$")
        if (parts.size != 4 || parts[0] != "pbkdf2-sha256") {
            return false
        }
        val encodedIterations = parts[1].toIntOrNull() ?: return false
        val salt = runCatching { Base64.getDecoder().decode(parts[2]) }.getOrNull() ?: return false
        val expected = runCatching { Base64.getDecoder().decode(parts[3]) }.getOrNull() ?: return false
        val actual = PasswordHasher(iterations = encodedIterations, keyLength = keyLength).derive(password, salt)
        return expected.contentEquals(actual)
    }

    private fun derive(password: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, keyLength)
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    }
}
