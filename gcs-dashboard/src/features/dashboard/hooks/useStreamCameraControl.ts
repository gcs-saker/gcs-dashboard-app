import { useCallback, useState } from "react";
import { requestCameraFacingMode, type CameraFacingMode } from "@streaming/publisher/cameraControlApi";

export function useStreamCameraControl(streamId: string | null | undefined) {
  const [pendingMode, setPendingMode] = useState<CameraFacingMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestFacingMode = useCallback(async (mode: CameraFacingMode): Promise<void> => {
    setPendingMode(mode);
    setMessage(null);
    try {
      if (!streamId) throw new Error("카메라 전환 대상 스트림이 없습니다.");
      await requestCameraFacingMode(streamId, mode);
      setMessage(mode === "front" ? "전면 카메라 전환 요청됨" : "후면 카메라 전환 요청됨");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카메라 전환 요청 실패");
    } finally {
      setPendingMode(null);
    }
  }, [streamId]);
  return { message, pendingMode, requestFacingMode } as const;
}
