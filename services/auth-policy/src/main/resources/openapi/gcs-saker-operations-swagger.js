window.onload = function () {
  const accessToken = window.prompt("관리자 access token을 입력하세요. 값은 저장되지 않습니다.");
  if (!accessToken) {
    document.getElementById("swagger-ui").textContent = "OpenAPI 명세를 보려면 관리자 access token이 필요합니다.";
    return;
  }
  window.ui = SwaggerUIBundle({
    url: "./openapi.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    displayRequestDuration: true,
    defaultModelsExpandDepth: 1,
    docExpansion: "list",
    persistAuthorization: false,
    tryItOutEnabled: false,
    supportedSubmitMethods: [],
    requestInterceptor: function (request) {
      request.headers.Authorization = "Bearer " + accessToken;
      return request;
    },
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
};
