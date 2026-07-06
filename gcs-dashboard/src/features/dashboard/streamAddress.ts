const STREAM_ADDRESS_PATTERN = /^(raw|ai|archive)\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?$/;

export function normalizeStreamAddress(address: string): string {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error("스트림 주소를 입력해야 합니다.");
  }

  const urlPath = streamPathFromUrl(trimmedAddress);
  const rawPath = urlPath ?? trimmedAddress;
  const withoutQuery = rawPath.split(/[?#]/)[0] ?? rawPath;
  const withoutEdgePrefix = withoutQuery
    .replace(/^\/+/, "")
    .replace(/^webrtc\//, "")
    .replace(/\/whip$/i, "")
    .replace(/\/whep$/i, "")
    .replace(/^hls\//, "")
    .replace(/\/index\.m3u8$/i, "");
  const normalized = withoutEdgePrefix.replace(/\//g, ".").replace(/\.+/g, ".").replace(/^\./, "").replace(/\.$/, "");
  if (!STREAM_ADDRESS_PATTERN.test(normalized)) {
    throw new Error("스트림 주소는 raw/asset/sensor 또는 raw.asset.sensor 형식이어야 합니다.");
  }
  return normalized;
}

function streamPathFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value, typeof window === "undefined" ? "https://dashboard.local" : window.location.href);
    return parsed.pathname;
  } catch {
    return null;
  }
}
