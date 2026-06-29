import { LOCAL_WEBCAM_STREAM_ID } from "../../../config";
import type { PublisherStreamTarget } from "./publisherContracts";

export const DEFAULT_STREAM_TARGETS: readonly PublisherStreamTarget[] = [
  { id: LOCAL_WEBCAM_STREAM_ID, label: "기본 웹캠", whipPath: "raw/local/webcam" },
  { id: "raw.local.front", label: "휴대폰 전면", whipPath: "raw/local/front" },
  { id: "raw.local.rear", label: "휴대폰 후면", whipPath: "raw/local/rear" },
] as const;

export function ensureStreamTargets(
  defaultTargets: readonly PublisherStreamTarget[],
  streamId: string,
  whipUrl: string,
): PublisherStreamTarget[] {
  const explicitTarget: PublisherStreamTarget = {
    id: streamId,
    label: "현재 설정",
    whipPath: inferWhipPath(whipUrl) ?? streamIdToWhipPath(streamId),
  };
  if (defaultTargets.some((target) => target.id === explicitTarget.id)) {
    return [...defaultTargets];
  }
  return [explicitTarget, ...defaultTargets];
}

export function buildWhipUrl(baseWhipUrl: string, whipPath: string): string {
  const suffix = "/whip";
  const suffixIndex = baseWhipUrl.indexOf(suffix);
  if (suffixIndex === -1) {
    return `/webrtc/${whipPath}/whip`;
  }
  const marker = "/webrtc/";
  const markerIndex = baseWhipUrl.lastIndexOf(marker, suffixIndex);
  if (markerIndex !== -1) {
    return `${baseWhipUrl.slice(0, markerIndex)}${marker}${whipPath}${baseWhipUrl.slice(suffixIndex)}`;
  }
  const inferredPath = inferWhipPath(baseWhipUrl);
  if (inferredPath) {
    return baseWhipUrl.replace(`/${inferredPath}${suffix}`, `/${whipPath}${suffix}`);
  }
  return `/webrtc/${whipPath}/whip`;
}

function streamIdToWhipPath(streamId: string): string {
  return streamId.split(".").join("/");
}

function inferWhipPath(whipUrl: string): string | null {
  const suffix = "/whip";
  const suffixIndex = whipUrl.indexOf(suffix);
  if (suffixIndex === -1) {
    return null;
  }
  const marker = "/webrtc/";
  const markerIndex = whipUrl.lastIndexOf(marker, suffixIndex);
  if (markerIndex !== -1) {
    return whipUrl.slice(markerIndex + marker.length, suffixIndex);
  }
  const pathStartIndex = whipUrl.lastIndexOf("/", Math.max(0, suffixIndex - 1));
  const schemeIndex = whipUrl.indexOf("://");
  const originEndIndex = schemeIndex === -1 ? -1 : whipUrl.indexOf("/", schemeIndex + 3);
  const fallbackStartIndex = originEndIndex === -1 ? 0 : originEndIndex + 1;
  const inferredPath = whipUrl.slice(fallbackStartIndex, suffixIndex).replace(/^\/+/, "");
  if (pathStartIndex === -1 || !inferredPath) {
    return null;
  }
  return inferredPath;
}
