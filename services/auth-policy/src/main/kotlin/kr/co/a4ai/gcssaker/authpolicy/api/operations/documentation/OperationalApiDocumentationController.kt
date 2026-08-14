package kr.co.a4ai.gcssaker.authpolicy.api

import org.springframework.core.io.ClassPathResource
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.util.StreamUtils
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.nio.charset.StandardCharsets

object OperationalApiDocumentationRoutes {
    const val ROOT = "/admin/api-docs"
    const val SWAGGER = "/swagger"
    const val OPENAPI = "/openapi.yaml"
    const val INITIALIZER = "/swagger-initializer.js"
    const val FLOW_STYLES = "/gcs-saker-operations-flow.css"
}

@RestController
@RequestMapping(OperationalApiDocumentationRoutes.ROOT)
class OperationalApiDocumentationController {
    @GetMapping(OperationalApiDocumentationRoutes.SWAGGER, produces = [MediaType.TEXT_HTML_VALUE])
    fun swagger(): ResponseEntity<String> {
        val openApi = readResource(OPENAPI_RESOURCE)
        val html = readResource(SWAGGER_RESOURCE).replace(API_CATALOG_MARKER, OperationalApiCatalogRenderer.render(openApi))
        return noStore(html, MediaType.TEXT_HTML)
    }

    @GetMapping(OperationalApiDocumentationRoutes.OPENAPI, produces = ["application/yaml"])
    fun openApi(): ResponseEntity<String> = noStore(readResource(OPENAPI_RESOURCE), MediaType.parseMediaType("application/yaml"))

    @GetMapping(OperationalApiDocumentationRoutes.INITIALIZER, produces = ["application/javascript"])
    fun initializer(): ResponseEntity<String> =
        noStore(readResource(INITIALIZER_RESOURCE), MediaType.parseMediaType("application/javascript"))

    @GetMapping(OperationalApiDocumentationRoutes.FLOW_STYLES, produces = ["text/css"])
    fun flowStyles(): ResponseEntity<String> =
        noStore(readResource(FLOW_STYLES_RESOURCE), MediaType.parseMediaType("text/css"))

    private fun noStore(body: String, mediaType: MediaType): ResponseEntity<String> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(mediaType).body(body)

    private fun readResource(path: String): String =
        StreamUtils.copyToString(ClassPathResource(path).inputStream, StandardCharsets.UTF_8)

    private companion object {
        const val OPENAPI_RESOURCE = "openapi/gcs-saker-operations.openapi.yaml"
        const val SWAGGER_RESOURCE = "openapi/gcs-saker-operations-swagger.html"
        const val INITIALIZER_RESOURCE = "openapi/gcs-saker-operations-swagger.js"
        const val FLOW_STYLES_RESOURCE = "openapi/gcs-saker-operations-flow.css"
        const val API_CATALOG_MARKER = "<!-- OPERATIONAL_API_CATALOG -->"
    }
}
