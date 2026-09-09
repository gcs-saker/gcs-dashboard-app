export const LOCAL_DEV_PROXY = "http://127.0.0.1:8080";

const PRODUCTION_HOSTS = new Set(["gcs-saker.com"]);

export function devProxyPolicy(target: string, env: Record<string, string>): { secure: boolean } {
  const parsed = new URL(target);
  if (PRODUCTION_HOSTS.has(parsed.hostname) && env.VITE_ALLOW_PRODUCTION_PROXY !== "true") {
    throw new Error("Production proxy requires VITE_ALLOW_PRODUCTION_PROXY=true");
  }
  const insecure = env.VITE_DEV_ALLOW_INSECURE_TLS === "true";
  if (insecure && !(env.VITE_DEV_PROFILE === "local-test" && isLoopback(parsed.hostname))) {
    throw new Error("TLS verification can be disabled only for a loopback local-test proxy");
  }
  return { secure: !insecure };
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
