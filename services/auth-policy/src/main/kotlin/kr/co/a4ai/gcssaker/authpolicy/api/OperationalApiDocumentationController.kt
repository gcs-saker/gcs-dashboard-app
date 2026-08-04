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
}

@RestController
@RequestMapping(OperationalApiDocumentationRoutes.ROOT)
class OperationalApiDocumentationController {
    @GetMapping(OperationalApiDocumentationRoutes.SWAGGER, produces = [MediaType.TEXT_HTML_VALUE])
    fun swagger(): ResponseEntity<String> = noStore(SWAGGER_HTML, MediaType.TEXT_HTML)

    @GetMapping(OperationalApiDocumentationRoutes.OPENAPI, produces = ["application/yaml"])
    fun openApi(): ResponseEntity<String> = noStore(readResource(OPENAPI_RESOURCE), MediaType.parseMediaType("application/yaml"))

    @GetMapping(OperationalApiDocumentationRoutes.INITIALIZER, produces = ["application/javascript"])
    fun initializer(): ResponseEntity<String> = noStore(SWAGGER_INITIALIZER, MediaType.parseMediaType("application/javascript"))

    private fun noStore(body: String, mediaType: MediaType): ResponseEntity<String> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(mediaType).body(body)

    private fun readResource(path: String): String =
        StreamUtils.copyToString(ClassPathResource(path).inputStream, StandardCharsets.UTF_8)

    private companion object {
        const val OPENAPI_RESOURCE = "openapi/gcs-saker-operations.openapi.yaml"
        const val SWAGGER_INITIALIZER = """window.onload = function () {
  const accessToken = window.prompt('관리자 access token을 입력하세요. 값은 저장되지 않습니다.');
  if (!accessToken) {
    document.getElementById('swagger-ui').textContent = '관리자 access token이 필요합니다.';
    return;
  }
  window.ui = SwaggerUIBundle({
    url: './openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    displayRequestDuration: true,
    persistAuthorization: false,
    tryItOutEnabled: false,
    supportedSubmitMethods: [],
    requestInterceptor: function (request) {
      request.headers.Authorization = 'Bearer ' + accessToken;
      return request;
    },
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout'
  });
};
"""
        const val SWAGGER_HTML = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>GCS-Saker 운영 API</title>
  <link rel="stylesheet" href="/auth-policy/webjars/swagger-ui/5.17.14/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/auth-policy/webjars/swagger-ui/5.17.14/swagger-ui-bundle.js"></script>
  <script src="/auth-policy/webjars/swagger-ui/5.17.14/swagger-ui-standalone-preset.js"></script>
  <script src="./swagger-initializer.js"></script>
</body>
</html>
"""
    }
}
