import { streamApiV1Url } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";

export type CameraFacingMode = "front" | "rear";

export interface CameraControlCommand {
  facingMode: CameraFacingMode | "";
  revision: number;
  updatedAt?: string;
}

function cameraControlUrl(streamId: string): string {
  return streamApiV1Url(`${STREAM_API_ROUTES.streams}/${encodeURIComponent(streamId)}/camera-control`);
}

export async function requestCameraFacingMode(
  streamId: string,
  facingMode: CameraFacingMode,
  fetcher: typeof fetch = fetch,
): Promise<CameraControlCommand> {
  const response = await authenticatedFetch(cameraControlUrl(streamId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facingMode }),
  }, fetcher);
  if (!response.ok) throw new Error(`카메라 전환 요청 실패 (${response.status})`);
  return parseCameraControlCommand(await response.json());
}

export async function fetchCameraControlCommand(
  streamId: string,
  fetcher: typeof fetch = fetch,
): Promise<CameraControlCommand> {
  const response = await authenticatedFetch(cameraControlUrl(streamId), {
    headers: { Accept: "application/json" },
  }, fetcher);
  if (!response.ok) throw new Error(`카메라 전환 상태 확인 실패 (${response.status})`);
  return parseCameraControlCommand(await response.json());
}

function parseCameraControlCommand(payload: unknown): CameraControlCommand {
  if (!payload || typeof payload !== "object") throw new Error("카메라 전환 응답이 올바르지 않습니다.");
  const value = payload as Partial<CameraControlCommand>;
  const facingMode = value.facingMode ?? "";
  if (!["", "front", "rear"].includes(facingMode) || typeof value.revision !== "number") {
    throw new Error("카메라 전환 응답이 올바르지 않습니다.");
  }
  return { facingMode, revision: value.revision, updatedAt: value.updatedAt };
}
