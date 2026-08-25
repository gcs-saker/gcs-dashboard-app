import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { requestCameraFacingMode } from "@streaming/publisher/cameraControlApi";
import { useStreamCameraControl } from "./useStreamCameraControl";

vi.mock("@streaming/publisher/cameraControlApi", () => ({ requestCameraFacingMode: vi.fn() }));

describe("useStreamCameraControl", () => {
  beforeEach(() => vi.mocked(requestCameraFacingMode).mockReset());

  test("reports an acknowledged rear camera command", async () => {
    vi.mocked(requestCameraFacingMode).mockResolvedValue({ facingMode: "rear", revision: 1 });
    const { result } = renderHook(() => useStreamCameraControl("raw.mobile.front"));

    await act(() => result.current.requestFacingMode("rear"));

    expect(requestCameraFacingMode).toHaveBeenCalledWith("raw.mobile.front", "rear");
    expect(result.current.message).toBe("후면 카메라 전환 요청됨");
    expect(result.current.pendingMode).toBeNull();
  });

  test("surfaces missing and rejected targets", async () => {
    const missing = renderHook(() => useStreamCameraControl(null));
    await act(() => missing.result.current.requestFacingMode("front"));
    expect(missing.result.current.message).toBe("카메라 전환 대상 스트림이 없습니다.");

  });
});
