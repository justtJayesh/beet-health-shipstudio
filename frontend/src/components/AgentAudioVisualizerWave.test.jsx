import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AgentAudioVisualizerWave } from "./AgentAudioVisualizerWave.jsx";

let mockBars = [];

vi.mock("@livekit/components-react", () => ({
  useAudioWaveform: () => ({ bars: mockBars }),
}));

describe("AgentAudioVisualizerWave", () => {
  it("renders one rect per amplitude bar", () => {
    mockBars = [0.2, 0.8, 0.5];
    const { container } = render(<AgentAudioVisualizerWave trackRef={undefined} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("scales rect height with amplitude and keeps every bar vertically centered", () => {
    mockBars = [0.1, 1];
    const { container } = render(<AgentAudioVisualizerWave trackRef={undefined} />);
    const [quiet, loud] = container.querySelectorAll("rect");

    const quietHeight = Number(quiet.getAttribute("height"));
    const loudHeight = Number(loud.getAttribute("height"));
    expect(loudHeight).toBeGreaterThan(quietHeight);

    const quietMid = Number(quiet.getAttribute("y")) + quietHeight / 2;
    const loudMid = Number(loud.getAttribute("y")) + loudHeight / 2;
    expect(quietMid).toBeCloseTo(loudMid, 5);
  });

  it("renders nothing when there are no bars yet", () => {
    mockBars = [];
    const { container } = render(<AgentAudioVisualizerWave trackRef={undefined} />);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});
