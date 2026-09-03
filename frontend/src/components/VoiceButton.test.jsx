import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { VoiceButton } from "./VoiceButton.jsx";

let capturedOnMediaDeviceFailure;
let mockAgentTranscriptions = [];
let mockState;

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children, token, serverUrl, onMediaDeviceFailure }) => {
    capturedOnMediaDeviceFailure = onMediaDeviceFailure;
    return (
      <div data-testid="livekit-room" data-token={token} data-url={serverUrl}>
        {children}
      </div>
    );
  },
  RoomAudioRenderer: () => <div data-testid="room-audio-renderer" />,
  useVoiceAssistant: () => ({ state: mockState, audioTrack: undefined, agentTranscriptions: mockAgentTranscriptions }),
  useAudioWaveform: () => ({ bars: [] }),
}));

vi.mock("livekit-client", () => ({
  MediaDeviceFailure: { PermissionDenied: "PermissionDenied", NotFound: "NotFound", DeviceInUse: "DeviceInUse", Other: "Other" },
}));

vi.mock("@livekit/components-styles", () => ({}));

beforeEach(() => {
  capturedOnMediaDeviceFailure = undefined;
  mockAgentTranscriptions = [];
  mockState = undefined;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: "test-token", url: "wss://example.com", roomName: "beet-voice-session" }),
  });
});

describe("VoiceButton", () => {
  it("shows the idle headline and orb before connecting", () => {
    render(<VoiceButton />);
    expect(screen.getByText("Talk to Beet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /talk to agent/i })).toBeInTheDocument();
  });

  it("fetches a token and connects when clicked", async () => {
    render(<VoiceButton />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/livekit-token"),
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => expect(screen.getByTestId("livekit-room")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /stop talking to agent/i })).toBeInTheDocument();
    expect(screen.getByTestId("room-audio-renderer")).toBeInTheDocument();
  });

  it("shows a live state word as the headline before any transcript arrives", async () => {
    mockState = "listening";
    render(<VoiceButton />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));

    await waitFor(() => expect(screen.getByText("Listening…")).toBeInTheDocument());
  });

  it("shows the agent's last spoken line as the headline, since TTS audio is easy to miss", async () => {
    mockAgentTranscriptions = [
      { text: "How much milk did you have?", final: true, id: "1" },
    ];
    render(<VoiceButton />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));

    await waitFor(() => expect(screen.getByText(/how much milk did you have\?/i)).toBeInTheDocument());
  });

  it("disconnects and tears down the room when clicked again", async () => {
    render(<VoiceButton />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));
    await waitFor(() => expect(screen.getByTestId("livekit-room")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /stop talking to agent/i }));

    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /talk to agent/i })).toBeInTheDocument();
  });

  it("calls onDisconnect when disconnecting so stale agent status can be cleared", async () => {
    const onDisconnect = vi.fn();
    render(<VoiceButton onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));
    await waitFor(() => expect(screen.getByTestId("livekit-room")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /stop talking to agent/i }));

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when the token fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    render(<VoiceButton />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));

    await waitFor(() => expect(screen.getByText(/failed/i)).toBeInTheDocument());
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
  });

  it("surfaces a clear message and disconnects when the mic permission is denied", async () => {
    const onDisconnect = vi.fn();
    render(<VoiceButton onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByRole("button", { name: /talk to agent/i }));
    await waitFor(() => expect(screen.getByTestId("livekit-room")).toBeInTheDocument());

    act(() => capturedOnMediaDeviceFailure("PermissionDenied"));

    expect(screen.getByText(/microphone permission denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
