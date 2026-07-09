export async function enableMocking(): Promise<void> {
  if (!shouldEnableMsw()) {
    return;
  }
  const { worker } = await import("./browser");
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
  });
}

function shouldEnableMsw(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (import.meta.env.VITE_ENABLE_MSW === "true") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  const query = new URLSearchParams(window.location.search);
  const isLocalPreviewHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  return isLocalPreviewHost && query.get("uiPreview") === "1";
}
