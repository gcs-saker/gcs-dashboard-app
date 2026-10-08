import { streamApiV1Url } from "@/config";
import { authenticatedFetch } from "@auth/authApi";

export interface ControlSession {
  controlSessionId: string;
  expiresAt: string;
  heartbeatIntervalMillis: number;
}

export interface ControlCommandInput {
  command: "STOP" | "MOTION";
  sequence: number;
  idempotencyId: string;
  forward?: number;
  right?: number;
}

export interface ControlCommandResult {
  commandId: string;
  status: string;
}

export async function createControlSession(
  deviceId: string,
  publishSessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ControlSession> {
  const response = await authenticatedFetch(streamApiV1Url("/control/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, publishSessionId }),
  }, fetcher);
  if (!response.ok) throw new Error(`제어 세션 생성 실패 (${response.status})`);
  return response.json() as Promise<ControlSession>;
}

export async function submitControlCommand(
  controlSessionId: string,
  command: ControlCommandInput,
  fetcher: typeof fetch = fetch,
): Promise<ControlCommandResult> {
  const session = encodeURIComponent(controlSessionId);
  const response = await authenticatedFetch(streamApiV1Url(`/control/sessions/${session}/commands`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  }, fetcher);
  if (!response.ok) throw new Error(`제어 명령 전송 실패 (${response.status})`);
  return response.json() as Promise<ControlCommandResult>;
}
