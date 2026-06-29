package kr.co.a4ai.gcssaker.authpolicy

import kotlin.io.path.Path
import kotlin.io.path.extension
import kotlin.io.path.isRegularFile
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BoundedContextBoundaryTest {
    @Test
    fun `auth api does not orchestrate stream ops telemetry or time APIs directly`() {
        val authApiFiles = sourceFiles("$SOURCE_ROOT/api")
            .filter { it.name.startsWith("Auth") || it.name == "BearerPrincipalResolver.kt" }

        authApiFiles.assertDoNotReference(
            forbiddenTokens = listOf(
                "StreamPolicyController",
                "OperationalEventController",
                "OperationalReadController",
                "TimeSyncController",
                "MqttTelemetryConsumerBridge",
            ),
        )
    }

    @Test
    fun `stream policy api depends on group policy domain and not operational read repositories`() {
        val streamPolicyFiles = sourceFiles("$SOURCE_ROOT/api")
            .filter { it.name.startsWith("StreamPolicy") }

        assertTrue(streamPolicyFiles.isNotEmpty())
        streamPolicyFiles.assertDoNotReference(
            forbiddenTokens = listOf(
                "OperationalReadRepository",
                "OperationalEventRepository",
                "TelemetryReadModel",
                "TimeSyncConfigRepository",
            ),
        )
    }

    @Test
    fun `telemetry protocol does not depend on api or infrastructure adapters`() {
        sourceFiles("$SOURCE_ROOT/protocol").assertDoNotReference(
            forbiddenTokens = listOf(
                "kr.co.a4ai.gcssaker.authpolicy.api.",
                "kr.co.a4ai.gcssaker.authpolicy.infrastructure.",
                "org.springframework.web",
                "org.springframework.data",
            ),
        )
    }

    private fun List<java.nio.file.Path>.assertDoNotReference(forbiddenTokens: List<String>) {
        forEach { file ->
            val text = file.readText()
            forbiddenTokens.forEach { token ->
                assertFalse(
                    text.contains(token),
                    "${file.name} must not reference $token",
                )
            }
        }
    }

    private fun sourceFiles(root: String): List<java.nio.file.Path> {
        val start = Path(root)
        val children = start.listDirectoryEntries()
        return children.flatMap { child ->
            when {
                child.isRegularFile() && child.extension == KOTLIN_EXTENSION -> listOf(child)
                child.isRegularFile() -> emptyList()
                else -> sourceFiles(child.toString())
            }
        }
    }

    private companion object {
        const val SOURCE_ROOT = "src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy"
        const val KOTLIN_EXTENSION = "kt"
    }
}
