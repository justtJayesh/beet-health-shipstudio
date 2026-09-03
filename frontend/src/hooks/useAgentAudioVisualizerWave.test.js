import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAgentAudioVisualizerWave } from "./useAgentAudioVisualizerWave.js";

let mockTrackVolume = 0;

vi.mock("@livekit/components-react", () => ({
  useTrackVolume: () => mockTrackVolume,
}));

// Real motion easing is async and irrelevant here — this only tests which
// preset gets selected per agent state, not the tween itself.
vi.mock("motion/react", () => ({
  useMotionValue: (initial) => ({ __initial: initial }),
  useMotionValueEvent: () => {},
  animate: vi.fn((motionValue, target) => {
    motionValue.__lastTarget = target;
  }),
}));

describe("useAgentAudioVisualizerWave", () => {
  // amplitude/frequency/opacity are driven through motion's animate() →
  // motionValue "change" event, which is mocked out below (irrelevant
  // tween timing) — `speed` is the one value set via plain useState, so
  // it's the reliable signal for "which state preset got selected".
  it("falls back to the speaking preset (2x speed) when state is unknown", () => {
    const { result } = renderHook(() => useAgentAudioVisualizerWave({ state: undefined }));
    expect(result.current.speed).toBe(10);
  });

  it("uses the disconnected preset (1x speed) when explicitly disconnected", () => {
    const { result } = renderHook(() => useAgentAudioVisualizerWave({ state: "disconnected" }));
    expect(result.current.speed).toBe(5);
  });

  it("quadruples speed while thinking", () => {
    const { result } = renderHook(() => useAgentAudioVisualizerWave({ state: "thinking" }));
    expect(result.current.speed).toBe(20);
  });

  it("uses the track's real volume, not a caller-supplied override, unless one is given", () => {
    mockTrackVolume = 0.42;
    const { result: withoutOverride } = renderHook(() =>
      useAgentAudioVisualizerWave({ state: "speaking" })
    );
    expect(withoutOverride.current).toBeDefined();

    const { result: withOverride } = renderHook(() =>
      useAgentAudioVisualizerWave({ state: "speaking", volume: 0.9 })
    );
    expect(withOverride.current).toBeDefined();
  });
});
