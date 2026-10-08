import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearAuthSession, storeAuthSession } from "@auth/authStorage";
import { createControlSession, submitControlCommand } from "./controlApi";

describe("controlApi", () => {
  beforeEach(() => {
    clearAuthSession();
    storeAuthSession({ accessToken: "access", expiresAt: "2099-01-01T00:00:00Z",
      user: { username: "operator", role: "operator", groupId: "co-a", securityVersion: 1 } });
  });

  test("creates a server-routed session without group, receiver, or topic", async () => {
    const fetcher = vi.fn(async () => Response.json({
      controlSessionId: "cs_opaque", expiresAt: "2099-01-01T00:00:00Z", heartbeatIntervalMillis: 1000,
    }, { status: 201 }));

    await createControlSession("device-01", "ps_session-01", fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("/media-control/api/v1/control/sessions", expect.objectContaining({
      body: JSON.stringify({ deviceId: "device-01", publishSessionId: "ps_session-01" }),
    }));
  });

  test("submits exact sequence and idempotency fields to Media Control", async () => {
    const fetcher = vi.fn(async () => Response.json({ commandId: "cmd_opaque", status: "accepted" }, { status: 202 }));

    await submitControlCommand("cs_opaque", {
      command: "MOTION", sequence: 1, idempotencyId: "idem-1", forward: 1, right: 0,
    }, fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("/media-control/api/v1/control/sessions/cs_opaque/commands",
      expect.objectContaining({ method: "POST" }));
  });
});
