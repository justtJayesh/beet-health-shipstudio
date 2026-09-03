import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentScreen } from "./AgentScreen.jsx";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }) => <div data-testid="livekit-room">{children}</div>,
  RoomAudioRenderer: () => <div data-testid="room-audio-renderer" />,
  useVoiceAssistant: () => ({ state: undefined, audioTrack: undefined, agentTranscriptions: [] }),
  BarVisualizer: () => <div data-testid="bar-visualizer" />,
}));
vi.mock("livekit-client", () => ({
  MediaDeviceFailure: { PermissionDenied: "PermissionDenied", NotFound: "NotFound", DeviceInUse: "DeviceInUse", Other: "Other" },
}));
vi.mock("@livekit/components-styles", () => ({}));

describe("AgentScreen", () => {
  it("renders the Talk to Beet hero with the real Talk to agent button", () => {
    render(<AgentScreen agentStatus={null} />);
    expect(screen.getByText("Talk to Beet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /talk to agent/i })).toBeInTheDocument();
  });

  it("suppresses StatusLine for states already covered by the live orb/headline", () => {
    render(<AgentScreen agentStatus={{ status: "listening", targetMealId: null }} />);
    expect(screen.queryByText("Agent: listening…")).not.toBeInTheDocument();
  });

  it("shows StatusLine only for awaiting_confirmation, which the voice-assistant state doesn't cover", () => {
    render(<AgentScreen agentStatus={{ status: "awaiting_confirmation", targetMealId: "m1" }} />);
    expect(screen.getByText("Agent: awaiting confirmation…")).toBeInTheDocument();
  });
});
