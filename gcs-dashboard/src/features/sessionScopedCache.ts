type SessionCacheReset = () => void;

const sessionCacheResets = new Set<SessionCacheReset>();

export function registerSessionScopedCache(reset: SessionCacheReset): void {
  sessionCacheResets.add(reset);
}

export function clearSessionScopedCaches(): void {
  for (const reset of sessionCacheResets) reset();
}
