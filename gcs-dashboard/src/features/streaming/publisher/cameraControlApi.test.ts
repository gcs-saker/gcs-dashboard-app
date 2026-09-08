import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearAuthSession, storeAuthSession } from "@auth/authStorage";
import { fetchCameraControlCommand, requestCameraFacingMode } from "./cameraControlApi";

describe("cameraControlApi", () => {
  beforeEach(() => {
    clearAuthSession();
    storeAuthSession({ accessToken: "access", expiresAt: "2099-01-01T00:00:00Z",
      user: { username: "operator", role: "operator", groupId: "co-a", securityVersion: 1 } });
  });

  test("sends a bounded front or rear command for the opaque stream", async () => {
    const fetcher = vi.fn(async () => Response.json({ facingMode: "rear", revision: 2, updatedAt: "2026-08-25T00:00:00Z" }));

    const command = await requestCameraFacingMode("raw.mobile.front", "rear", fetcher as unknown as typeof fetch);

    expect(command).toMatchObject({ facingMode: "rear", revision: 2 });
    expect(fetcher).toHaveBeenCalledWith(
      "/media-control/api/v1/streams/raw.mobile.front/camera-control",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ facingMode: "rear" }) }),
    );
  });

  test("reads the latest command for a mobile publisher", async () => {
    const fetcher = vi.fn(async () => Response.json({ facingMode: "front", revision: 3 }));

    await expect(fetchCameraControlCommand("raw.mobile.front", fetcher as unknown as typeof fetch))
      .resolves.toMatchObject({ facingMode: "front", revision: 3 });
  });
});
