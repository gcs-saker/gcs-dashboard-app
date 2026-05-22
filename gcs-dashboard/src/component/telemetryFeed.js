import { apiUrl } from "../config";

export async function fetchTelemetryNodes({ token, fetcher = fetch } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let response;

  try {
    response = await fetcher(apiUrl("/telemetry/all"), { headers });
  } catch {
    return [];
  }

  if (!response.ok || !isJsonResponse(response)) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function isJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") ?? "";
  return contentType.includes("application/json");
}
