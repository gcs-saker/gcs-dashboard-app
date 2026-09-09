package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
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
}
