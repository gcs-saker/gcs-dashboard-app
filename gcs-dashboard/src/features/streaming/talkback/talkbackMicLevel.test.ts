import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateMicLevel, monitorLocalMicLevel } from "./talkbackMicLevel";

describe("talkbackMicLevel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calculates normalized mic level from time-domain samples", () => {
    expect(calculateMicLevel(new Uint8Array([]))).toBe(0);
    expect(calculateMicLevel(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(calculateMicLevel(new Uint8Array([0, 255]), 4)).toBeCloseTo(1, 5);
  });

  it("returns a noop monitor when AudioContext is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const setMicLevel = vi.fn();
    const stop = monitorLocalMicLevel({} as MediaStream, setMicLevel);

    expect(setMicLevel).toHaveBeenCalledWith(null);
    expect(() => stop()).not.toThrow();
  });

  it("samples mic level and cleans up browser audio resources", async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const close = vi.fn(async () => undefined);
    const getByteTimeDomainData = vi.fn((samples: Uint8Array) => {
      samples.set([0, 255]);
    });
    const setMicLevel = vi.fn();
    const audioContext = {
      close,
      createAnalyser: () => ({
        fftSize: 0,
        frequencyBinCount: 2,
        getByteTimeDomainData,
      }),
      createMediaStreamSource: () => ({
        connect: vi.fn(),
        disconnect,
      }),
    };
    vi.stubGlobal("AudioContext", vi.fn(function AudioContextMock() {
      return audioContext;
    }));

    const stop = monitorLocalMicLevel({} as MediaStream, setMicLevel);
    await vi.advanceTimersByTimeAsync(120);

    expect(getByteTimeDomainData).toHaveBeenCalledOnce();
    expect(setMicLevel).toHaveBeenCalledWith(1);

    stop();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(setMicLevel).toHaveBeenLastCalledWith(null);
  });
});
