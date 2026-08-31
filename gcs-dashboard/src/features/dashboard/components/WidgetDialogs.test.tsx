import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { resetDashboardLayout } from "@dashboard/layout/dashboardLayout";
import { WidgetAddDialog } from "./WidgetAddDialog";
import { WidgetPopout } from "./WidgetPopout";

describe("dashboard widget dialogs", () => {
  test("toggles and applies widget visibility changes", () => {
    const onApply = vi.fn();
    const onToggleWidget = vi.fn();
    const layout = resetDashboardLayout();
    render(<WidgetAddDialog layout={layout} onApply={onApply} onCancel={vi.fn()}
      onReset={vi.fn()} onToggleWidget={onToggleWidget} />);

    fireEvent.click(screen.getByRole("button", { name: /자산트리/ }));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    expect(onToggleWidget).toHaveBeenCalledWith("asset-tree", false);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test("closes a widget popout", () => {
    const onClose = vi.fn();
    render(<WidgetPopout onClose={onClose} widget={resetDashboardLayout()[0]} />);

    fireEvent.click(screen.getByTitle("닫기"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "자산트리 팝아웃" })).toBeInTheDocument();
  });
});
