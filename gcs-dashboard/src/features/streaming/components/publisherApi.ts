import { streamApiV1Url } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";

export async function fetchAuthorizedPublishWhipUrl(streamId: string, fetcher: typeof fetch): Promise<string> {
  const response = await authenticatedFetch(
    streamApiV1Url(`${STREAM_API_ROUTES.streams}/${streamId}/publish`),
    { method: "GET", headers: { Accept: "application/json" } },
    fetcher,
  );
  if (!response.ok) {
    throw new Error(`Publish authorization failed with ${response.status}`);
  }
  const payload = (await response.json()) as { whipUrl?: string };
  if (!payload.whipUrl) {
    throw new Error("Publish authorization response did not include a WHIP URL");
  }
  return payload.whipUrl;
}
