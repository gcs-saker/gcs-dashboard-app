package kr.co.a4ai.gcssaker.authpolicy.domain

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PasswordHasherTest {
    private val hasher = PasswordHasher()

    @Test
    fun `password is stored as pbkdf2 hash and can be verified`() {
        val encoded = hasher.hash("correct-password")

        assertTrue(encoded.startsWith("pbkdf2-sha256$"))
        assertFalse(encoded.contains("correct-password"))
        assertTrue(hasher.verify("correct-password", encoded))
        assertFalse(hasher.verify("wrong-password", encoded))
    }

    @Test
    fun `invalid hash format is rejected`() {
        assertFalse(hasher.verify("correct-password", "plain-text"))
    }
}
