import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AssetTreeNode } from "@dashboard/assetTree";
import { AssetTreePanel } from "./AssetTreePanel";

afterEach(() => vi.unstubAllGlobals());

describe("AssetTreePanel", () => {
  test("allows an administrator to save a device alias in place", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
      deviceUuid: "device-001", deviceType: "robot", groupId: "team-a",
      displayName: "현장 로봇", status: "active", sensors: [], streamPaths: [],
    }));
    vi.stubGlobal("fetch", fetcher);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssetTreePanel canRenameDevices currentUsername="admin01" root={tree()} />
      </QueryClientProvider>,
    );

    const input = screen.getByRole("textbox", { name: "기존 장비 장비 별칭" });
    await user.clear(input);
    await user.type(input, "현장 로봇");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(fetcher.mock.calls[0]?.[0]).toBe("/auth-policy/admin/devices/device-001");
  });

  test("does not expose alias editing to non-administrators", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssetTreePanel currentUsername="operator01" root={tree()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("기존 장비")).toBeInTheDocument();
  });
});

function tree(): AssetTreeNode {
  return {
    id: "root", label: "접근 가능 자산", type: "root", status: "offline",
    children: [{ id: "device-001", label: "기존 장비", type: "device", status: "offline", detail: "robot" }],
  };
}
