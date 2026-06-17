package kr.co.a4ai.gcssaker.authpolicy

import kotlin.io.path.Path
import kotlin.io.path.extension
import kotlin.io.path.isRegularFile
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ArchitectureBoundaryTest {
    @Test
    fun `root package keeps only bootstrapping classes`() {
        val rootFiles = Path(SOURCE_ROOT)
            .listDirectoryEntries()
            .filter { it.isRegularFile() && it.extension == KOTLIN_EXTENSION }
            .map { it.name }
            .sorted()

        assertEquals(
            listOf("AuthPolicyApplication.kt", "AuthPolicyConfig.kt"),
            rootFiles,
        )
    }

    @Test
    fun `infrastructure code does not depend on api controllers`() {
        val infrastructureFiles = sourceFiles("$SOURCE_ROOT/infrastructure")

        infrastructureFiles.forEach { file ->
            val text = file.readText()
            assertFalse(
                text.contains("kr.co.a4ai.gcssaker.authpolicy.api."),
                "${file.name} must not import api layer",
            )
        }
    }

    @Test
    fun `expected backend layers exist before persistence and graphql expansion`() {
        val layerNames = Path(SOURCE_ROOT)
            .listDirectoryEntries()
            .filter { !it.isRegularFile() }
            .map { it.name }
            .toSet()

        assertTrue("api" in layerNames)
        assertTrue("application" in layerNames)
        assertTrue("domain" in layerNames)
        assertTrue("infrastructure" in layerNames)
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
