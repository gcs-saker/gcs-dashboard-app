package kr.co.a4ai.gcssaker.authpolicy.api

import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ObservabilityRouteContractTest {
    @Test
    fun `prometheus actuator endpoint is a dedicated observability route`() {
        assertEquals("/actuator", ObservabilityApiRoutes.ACTUATOR_ROOT)
        assertEquals("/actuator/prometheus", ObservabilityApiRoutes.PROMETHEUS)
    }

    @Test
    fun `public edge blocks auth policy actuator route`() {
        val singleNode = readRepoFile("deploy/nginx/single-node.poc.conf")
        val httpsEdge = readRepoFile("deploy/nginx/gcs-saker.reverse-proxy.example.conf")

        listOf(singleNode, httpsEdge).forEach { config ->
            assertTrue(config.contains("location /auth-policy/actuator/"))
            assertTrue(config.contains("return 404;"))
        }
    }

    private fun readRepoFile(path: String): String =
        Path.of(System.getProperty("user.dir")).resolve("../..").resolve(path).normalize().readText()
}
