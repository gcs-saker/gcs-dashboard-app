import { describe, expect, it } from "vitest";
import {
  isWhepConnectionInterrupted,
  isWhepConnectionReady,
  statusFromConnection,
} from "./whepConnectionState";

describe("whepConnectionState", () => {
  it("detects ready WHEP playback states", () => {
    expect(isWhepConnectionReady("connected", "checking")).toBe(true);
    expect(isWhepConnectionReady("connecting", "connected")).toBe(true);
    expect(isWhepConnectionReady("connecting", "completed")).toBe(true);
    expect(isWhepConnectionReady("connecting", "checking")).toBe(false);
  });

  it("detects interrupted WHEP playback states", () => {
    expect(isWhepConnectionInterrupted("failed", "checking")).toBe(true);
    expect(isWhepConnectionInterrupted("connecting", "disconnected")).toBe(true);
    expect(isWhepConnectionInterrupted("connected", "connected")).toBe(false);
  });

  it("maps connection states to stable playback status", () => {
    expect(statusFromConnection("connected", "checking", "loading")).toBe("playing");
    expect(statusFromConnection("connecting", "failed", "playing")).toBe("error");
    expect(statusFromConnection("new", "new", "idle")).toBe("loading");
    expect(statusFromConnection("new", "new", "playing")).toBe("playing");
  });
});
