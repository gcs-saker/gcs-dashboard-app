import { describe, expect, test } from "vitest";

import { reconnectDelayForAttempt } from "./publisherReconnectPolicy";

describe("publisherReconnectPolicy", () => {
  test("uses bounded backoff and requires manual recovery after the final attempt", () => {
    expect([0, 1, 2].map(reconnectDelayForAttempt)).toEqual([1_000, 2_000, 5_000]);
    expect(reconnectDelayForAttempt(3)).toBeNull();
    expect(reconnectDelayForAttempt(-1)).toBeNull();
  });
});
