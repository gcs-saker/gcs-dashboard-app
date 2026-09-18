import { MAX_RECONNECT_ATTEMPTS, RECONNECT_DELAYS_MS } from "./publisherContracts";

export function reconnectDelayForAttempt(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= MAX_RECONNECT_ATTEMPTS) return null;
  return RECONNECT_DELAYS_MS[attempt];
}
