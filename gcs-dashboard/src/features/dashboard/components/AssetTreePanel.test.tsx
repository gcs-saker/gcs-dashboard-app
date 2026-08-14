import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { AssetTreeNode } from "@dashboard/assetTree";
import { AssetTreePanel } from "./AssetTreePanel";

describe("AssetTreePanel", () => {
  test("lets every signed-in user save a personal device alias", async () => {
    const user = userEvent.setup();
    const onSetDeviceAlias = vi.fn();
    render(<AssetTreePanel onSetDeviceAlias={onSetDeviceAlias} root={tree()} />);

    const input = screen.getByRole("textbox", { name: "기존 장비 개인 별칭" });
    await user.clear(input);
    await user.type(input, "현장 로봇");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(onSetDeviceAlias).toHaveBeenCalledWith("device-001", "현장 로봇");
  });

  test("allows clearing a personal alias to restore the official name", async () => {
    const user = userEvent.setup();
    const onSetDeviceAlias = vi.fn();
    render(<AssetTreePanel onSetDeviceAlias={onSetDeviceAlias} root={tree()} />);

    await user.clear(screen.getByRole("textbox", { name: "기존 장비 개인 별칭" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(onSetDeviceAlias).toHaveBeenCalledWith("device-001", "");
  });
});

function tree(): AssetTreeNode {
  return {
    id: "root",
    label: "접근 가능 자산",
    type: "root",
    status: "offline",
    children: [
      { id: "device-001", label: "기존 장비", type: "device", status: "offline", detail: "robot" },
    ],
  };
}
