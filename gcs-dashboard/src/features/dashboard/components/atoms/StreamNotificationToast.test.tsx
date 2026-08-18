import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StreamNotificationToast } from "./StreamNotificationToast";

describe("StreamNotificationToast", () => {
  it("opens the detected stream without exposing its address", () => {
    const onOpen = vi.fn();
    render(
      <StreamNotificationToast
        notification={{ id: "notice-1", message: "새 모바일 스트림", streamId: "raw.private.front" }}
        onDismiss={vi.fn()}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByText("새 모바일 스트림"));

    expect(onOpen).toHaveBeenCalledWith("raw.private.front");
    expect(screen.queryByText("raw.private.front")).not.toBeInTheDocument();
  });
});
