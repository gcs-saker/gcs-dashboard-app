function initializeOperationalSwagger() {
  if (typeof SwaggerUIBundle === "undefined") {
    document.getElementById("swagger-ui").innerHTML =
      '<p class="swagger-error" role="alert">Swagger UI 리소스를 표시하지 못했습니다.</p>';
    return;
  }
  window.ui = SwaggerUIBundle({
    url: "/auth-policy/admin/api-docs/openapi.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    displayRequestDuration: true,
    defaultModelsExpandDepth: 1,
    docExpansion: "list",
    persistAuthorization: false,
    tryItOutEnabled: false,
    supportedSubmitMethods: [],
    onFailure: function () {
      document.getElementById("swagger-ui").innerHTML =
        '<p class="swagger-error" role="alert">OpenAPI 명세를 표시하지 못했습니다. 서버 상태를 확인해 주세요.</p>';
    },
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeOperationalSwagger, { once: true });
} else {
  initializeOperationalSwagger();
}
