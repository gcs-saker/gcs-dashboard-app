package kr.co.a4ai.gcssaker.authpolicy.api

object OperationalApiCatalogRenderer {
    private val pathPattern = Regex("^  (/[^:]+):$")
    private val methodPattern = Regex("^    (get|post|put|patch|delete):(?:.*summary: ([^,}]+))?.*$")
    private val summaryPattern = Regex("^      summary: (.+)$")

    fun render(openApi: String): String {
        val operations = parse(openApi)
        val cards = operations.joinToString("\n") { operation ->
            """<li>
              <span class="api-catalog__method api-catalog__method--${operation.method.lowercase()}">${operation.method}</span>
              <code>${escape(operation.path)}</code>
              <span>${escape(operation.summary)}</span>
            </li>""".trimIndent()
        }
        return """
            <section class="api-catalog" aria-labelledby="api-catalog-title">
              <div class="api-catalog__heading">
                <h3 id="api-catalog-title">API 빠른 목록</h3><span>${operations.size} operations</span>
              </div>
              <ul>$cards</ul>
            </section>
        """.trimIndent()
    }

    private fun parse(openApi: String): List<ApiOperation> {
        val operations = mutableListOf<ApiOperation>()
        var currentPath: String? = null
        openApi.lineSequence().forEach { line ->
            pathPattern.matchEntire(line)?.let { currentPath = it.groupValues[1] }
            methodPattern.matchEntire(line)?.let { match ->
                val path = currentPath ?: return@let
                val inlineSummary = match.groupValues[2].trim()
                operations += ApiOperation(match.groupValues[1].uppercase(), path, inlineSummary)
            } ?: summaryPattern.matchEntire(line)?.let { match ->
                if (operations.isNotEmpty() && operations.last().summary.isBlank()) {
                    operations[operations.lastIndex] = operations.last().copy(summary = match.groupValues[1].trim())
                }
            }
        }
        return operations
    }

    private fun escape(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private data class ApiOperation(val method: String, val path: String, val summary: String)
}
