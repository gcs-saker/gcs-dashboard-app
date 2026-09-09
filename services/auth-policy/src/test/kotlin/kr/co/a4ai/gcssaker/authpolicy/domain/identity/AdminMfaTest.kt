package kr.co.a4ai.gcssaker.authpolicy.domain

import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AdminMfaTest {
    private val admin = AuthenticatedPrincipal("admin", UserRole.ADMIN, GroupId("root"))
    private val operator = AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a"))

    @Test
    fun `admin requires valid RFC TOTP before token issuance`() {
        val verifier = verifier(emptySet(), OneTimeRecoveryCodes())

        assertTrue(verifier.verify(admin, "287082"))
        assertFalse(verifier.verify(admin, "287082"))
        assertFalse(verifier.verify(admin, "000000"))
        assertFalse(verifier.verify(admin, null))
        assertTrue(verifier.verify(operator, null))
    }

    @Test
    fun `recovery code can be consumed only once`() {
        val rawCode = "recovery-one-time-code"
        val store = OneTimeRecoveryCodes()
        val verifier = verifier(setOf(sha256(rawCode), "c".repeat(64)), store)

        assertTrue(verifier.verify(admin, rawCode))
        assertFalse(verifier.verify(admin, rawCode))
    }

    private fun verifier(hashes: Set<String>, store: RecoveryCodeStore) =
        TotpAdminMfaVerifier(
            "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            hashes.ifEmpty { setOf("a".repeat(64), "b".repeat(64)) },
            store,
            Clock.fixed(Instant.ofEpochSecond(59), ZoneOffset.UTC),
        )
}

private class OneTimeRecoveryCodes : RecoveryCodeStore {
    private val consumed = mutableSetOf<String>()
    override fun consume(codeHash: String) = consumed.add(codeHash)
}

private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
