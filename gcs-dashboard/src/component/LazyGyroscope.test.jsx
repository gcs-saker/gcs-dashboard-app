import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import LazyGyroscope from "./LazyGyroscope";

vi.mock("./Gyroscope", () => ({
  default: ({ mx, my, mz, size }) => (
    <div data-testid="gyroscope">
      {mx}:{my}:{mz}:{size}
    </div>
  ),
}));

describe("LazyGyroscope", () => {
  test("renders a lightweight fallback before loading the 3D gyroscope", async () => {
    render(<LazyGyroscope mx={1} my={2} mz={3} size={180} />);

    expect(screen.getByLabelText("지자계 로딩")).toBeInTheDocument();
    expect(await screen.findByTestId("gyroscope")).toHaveTextContent("1:2:3:180");
  });
});
