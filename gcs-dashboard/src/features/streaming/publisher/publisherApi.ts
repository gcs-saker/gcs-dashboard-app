import { streamApiV1Url } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";
import { STREAM_JSON_ACCEPT_HEADERS } from "@streaming/streamingProtocolHeaders";

export interface AuthorizedPublishSession {
  iceServers: RTCIceServer[];
  whipUrl: string;
}

interface AuthorizedPublishResponse {
  iceServers?: RTCIceServer[];
  whipUrl?: string;
}

export async function fetchAuthorizedPublishSession(
  streamId: string,
  fetcher: typeof fetch,
): Promise<AuthorizedPublishSession> {
  const response = await authenticatedFetch(
    streamApiV1Url(`${STREAM_API_ROUTES.streams}/${streamId}/publish`),
    { method: "GET", headers: STREAM_JSON_ACCEPT_HEADERS },
    fetcher,
  );
  if (!response.ok) {
    throw new Error(`Publish authorization failed with ${response.status}`);
  }
  const payload = (await response.json()) as AuthorizedPublishResponse;
  if (!payload.whipUrl) {
    throw new Error("Publish authorization response did not include a WHIP URL");
  }
  return {
    iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : [],
    whipUrl: payload.whipUrl,
  };
}

export async function fetchAuthorizedTalkbackSession(
  streamId: string,
  operatorId: string | undefined,
  fetcher: typeof fetch,
): Promise<AuthorizedPublishSession> {
  const query = operatorId?.trim() ? `?operatorId=${encodeURIComponent(operatorId.trim())}` : "";
  const response = await authenticatedFetch(
    streamApiV1Url(`${STREAM_API_ROUTES.streams}/${streamId}/talkback-publish${query}`),
    { method: "GET", headers: STREAM_JSON_ACCEPT_HEADERS },
    fetcher,
  );
  if (!response.ok) {
    throw new Error(`Talkback authorization failed with ${response.status}`);
  }
  const payload = (await response.json()) as AuthorizedPublishResponse;
  if (!payload.whipUrl) {
    throw new Error("Talkback authorization response did not include a WHIP URL");
  }
  return {
    iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : [],
    whipUrl: payload.whipUrl,
  };
}
