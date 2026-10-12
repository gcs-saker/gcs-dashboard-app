package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InternalGrpcTransportTest {
    @Test
    fun `plaintext internal RPC is rejected outside local test`() {
        val settings = InternalGrpcSettings(9091, "t".repeat(32), "", "", "", true)

        assertFailsWith<IllegalArgumentException> {
            DevicePolicyRpcConfiguration().rpcServerBuilder(settings, emptySet())
        }
    }

    @Test
    fun `production internal RPC rejects missing certificates`() {
        val settings = InternalGrpcSettings(9091, "t".repeat(32), "", "", "", false)

        assertFailsWith<IllegalArgumentException> {
            DevicePolicyRpcConfiguration().rpcServerBuilder(settings, setOf("production"))
        }
    }

    @Test
    fun `credential rotation accepts distinct strong current and previous tokens`() {
        val current = "c".repeat(32)
        val previous = "p".repeat(32)
        val settings = InternalGrpcSettings(9091, current, "ca", "cert", "key", false, previous)

        assertEquals(listOf(current, previous), settings.acceptedTokens())
    }

    @Test
    fun `credential rotation rejects weak or reused tokens`() {
        assertFailsWith<IllegalArgumentException> {
            InternalGrpcSettings(9091, "short", "ca", "cert", "key", false).acceptedTokens()
        }
        assertFailsWith<IllegalArgumentException> {
            val reused = "s".repeat(32)
            InternalGrpcSettings(9091, reused, "ca", "cert", "key", false, reused).acceptedTokens()
        }
    }
}
