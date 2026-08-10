window.onload = function () {
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
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
};
