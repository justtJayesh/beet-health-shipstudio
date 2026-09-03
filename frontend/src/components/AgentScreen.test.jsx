import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentScreen } from "./AgentScreen.jsx";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }) => <div data-testid="livekit-room">{children}</div>,
  RoomAudioRenderer: () => <div data-testid="room-audio-renderer" />,
  useLocalParticipant: () => ({ microphoneTrack: undefined }),
  useVoiceAssistant: () => ({ agentTranscriptions: [] }),
  BarVisualizer: () => <div data-testid="bar-visualizer" />,
}));
vi.mock("livekit-client", () => ({
  MediaDeviceFailure: { PermissionDenied: "PermissionDenied", NotFound: "NotFound", DeviceInUse: "DeviceInUse", Other: "Other" },
}));
vi.mock("@livekit/components-styles", () => ({}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: "test-token", url: "wss://example.com", roomName: "beet-voice-session" }),
  });
});

describe("AgentScreen", () => {
  it("renders the Talk to Beet hero with the real Talk to agent button", () => {
    render(<AgentScreen agentStatus={null} />);
    expect(screen.getByText("Talk to Beet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /talk to agent/i })).toBeInTheDocument();
  });

  it("shows the status line when agentStatus is set", () => {
    render(<AgentScreen agentStatus={{ status: "listening", targetMealId: null }} />);
    expect(screen.getByText("Agent: listening…")).toBeInTheDocument();
  });
});
