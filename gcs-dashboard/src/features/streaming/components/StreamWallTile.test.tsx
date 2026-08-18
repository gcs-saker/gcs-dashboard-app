import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { StreamWallTile } from "./StreamWallTile";

describe("StreamWallTile", () => {
  test("labels an empty slot picker without rendering overlapping helper text", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <StreamWallTile
        index={3}
        onSelect={onSelect}
        onToggleAi={vi.fn()}
        stream={null}
        streams={[]}
      />,
    );

    const picker = screen.getByRole("combobox", { name: "4번 화면 스트림 선택" });
    expect(picker).toHaveTextContent("스트림 선택");
    expect(screen.queryByText("4번 화면 스트림 선택")).not.toBeInTheDocument();

    await user.selectOptions(picker, "");
    expect(onSelect).toHaveBeenCalledWith(3, null);
  });
});
