import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { StreamingSmokeDashboard } from "./StreamingSmokeDashboard";

vi.mock("./RealtimePlayer", () => ({
  RealtimePlayer: function MockRealtimePlayer({
    streamId,
    title,
  }: {
    streamId: string;
    title: string;
  }) {
    return (
      <div data-testid="realtime-player">
        {title}:{streamId}
      </div>
    );
  },
}));

describe("StreamingSmokeDashboard", () => {
  test("renders the M1 sample stream through RealtimePlayer", () => {
    render(<StreamingSmokeDashboard />);

    expect(screen.getByLabelText("Streaming E2E smoke")).toBeInTheDocument();
    expect(screen.getByTestId("realtime-player")).toHaveTextContent(
      "Streaming E2E smoke:raw.sample.front",
    );
  });
});
