export const QUERY_PERSISTENCE_POLICY = Object.freeze({
  indexedDbAllowed: Object.freeze([
    "server-health-snapshot",
    "rtt-history",
    "event-log-recent-read-model",
    "device-catalog-read-model",
  ]),
  memoryOnly: Object.freeze([
    "auth-principal",
    "permission-policy",
    "csrf-state",
    "access-token",
  ]),
  serverRevalidateRequired: Object.freeze([
    "group-access",
    "stream-control-permission",
    "device-command-authorization",
  ]),
});

export function canPersistQueryReadModel(queryResponsibility: string): boolean {
  return QUERY_PERSISTENCE_POLICY.indexedDbAllowed.includes(queryResponsibility);
}
