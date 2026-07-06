import { apiUrl, streamApiV1Url } from "@/config";
import { DASHBOARD_API_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import { ApiHttpError, fetchValidatedJson, type PayloadGuard } from "@features/apiClient";
import { AuthApiError } from "@auth/authApi";
import {
  isStreamRegistryResponse,
  type StreamDeviceOption,
  type StreamRegistryResponse,
  type TelemetryHistoryResponse,
  type TelemetryReadResponse,
} from "./streamDeviceContracts";
import { streamDeviceFromRegistryItem } from "./streamDeviceMapping";
import {
  buildTelemetryHistoryPath,
  isTelemetryHistoryResponse,
  isTelemetryReadResponse,
} from "./telemetryContracts";

export async function fetchStreamDeviceOptions(fetcher: typeof fetch = fetch): Promise<StreamDeviceOption[]> {
  const [registry, telemetryByUuid] = await Promise.all([
    fetchStreamRegistry(fetcher),
    fetchTelemetryIndex(fetcher),
  ]);
  return registry.map((item) => streamDeviceFromRegistryItem(item, telemetryByUuid));
}

async function fetchStreamRegistry(fetcher: typeof fetch): Promise<StreamRegistryResponse[]> {
  try {
    return await fetchDashboardJson(streamApiV1Url(STREAM_API_ROUTES.streams), fetcher, isStreamRegistryResponseList, "stream registry request", "stream registry response");
  } catch (error) {
    throwAuthErrorFromStatus(error, "stream registry authentication required");
  }
}

export async function fetchTelemetryIndex(fetcher: typeof fetch = fetch): Promise<Map<string, TelemetryReadResponse>> {
  try {
    const telemetry = await fetchDashboardJson(apiUrl(DASHBOARD_API_ROUTES.telemetryAll), fetcher, isTelemetryReadResponseList, "telemetry request", "telemetry response");
    return new Map(telemetry.map((item) => [item.uuid, item]));
  } catch (error) {
    if (isApiStatusError(error, 401)) throw new AuthApiError(401, "telemetry authentication required");
    if (error instanceof ApiHttpError) return new Map();
    throw error;
  }
}

export async function fetchTelemetryHistory(
  uuid: string,
  limit = 100,
  fetcher: typeof fetch = fetch,
): Promise<TelemetryHistoryResponse[]> {
  try {
    return await fetchDashboardJson(apiUrl(buildTelemetryHistoryPath(uuid, limit)), fetcher, isTelemetryHistoryResponseList, "telemetry history request", "telemetry history response");
  } catch (error) {
    if (isApiStatusError(error, 401)) throw new AuthApiError(401, "telemetry history authentication required");
    if (error instanceof ApiHttpError) return [];
    throw error;
  }
}

function fetchDashboardJson<T>(
  url: string,
  fetcher: typeof fetch,
  isPayload: PayloadGuard<T>,
  requestDescription: string,
  invalidPayloadDescription: string,
): Promise<T> {
  return fetchValidatedJson({ url, fetcher, isPayload, requestDescription, invalidPayloadDescription });
}

function isStreamRegistryResponseList(payload: unknown): payload is StreamRegistryResponse[] {
  return Array.isArray(payload) && payload.every(isStreamRegistryResponse);
}

function isTelemetryReadResponseList(payload: unknown): payload is TelemetryReadResponse[] {
  return Array.isArray(payload) && payload.every(isTelemetryReadResponse);
}

function isTelemetryHistoryResponseList(payload: unknown): payload is TelemetryHistoryResponse[] {
  return Array.isArray(payload) && payload.every(isTelemetryHistoryResponse);
}

function throwAuthErrorFromStatus(error: unknown, message: string): never {
  if (isApiStatusError(error, 401)) throw new AuthApiError(401, message);
  throw error;
}

function isApiStatusError(error: unknown, status: number): boolean {
  return error instanceof ApiHttpError && error.status === status;
}
