import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { AgentAudioVisualizerWave } from "./AgentAudioVisualizerWave.jsx";

vi.mock("../hooks/useAgentAudioVisualizerWave.js", () => ({
  useAgentAudioVisualizerWave: () => ({ speed: 5, amplitude: 0.025, frequency: 10, opacity: 1 }),
}));

// jsdom doesn't implement WebGL — stub it to null explicitly (the real
// component already handles that by simply not animating) instead of
// letting jsdom log a noisy "not implemented" error per test.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("AgentAudioVisualizerWave", () => {
  it("renders a canvas tagged with the current agent state", () => {
    const { container } = render(<AgentAudioVisualizerWave state="speaking" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("data-lk-state", "speaking");
  });

  it("sizes the canvas from the size prop", () => {
    const { container } = render(<AgentAudioVisualizerWave size="sm" />);
    const canvas = container.querySelector("canvas");
    expect(canvas.style.width).toBe("56px");
    expect(canvas.style.height).toBe("56px");
  });

  it("defaults to the lg size when none is given", () => {
    const { container } = render(<AgentAudioVisualizerWave />);
    const canvas = container.querySelector("canvas");
    expect(canvas.style.width).toBe("224px");
  });

  it("does not throw when WebGL is unavailable, since jsdom has no real GL context", () => {
    expect(() => render(<AgentAudioVisualizerWave audioTrack={undefined} />)).not.toThrow();
  });
});
