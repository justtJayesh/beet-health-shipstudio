import { useCallback, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant } from "@livekit/components-react";
import { MediaDeviceFailure } from "livekit-client";
import { AgentAudioVisualizerWave } from "./AgentAudioVisualizerWave.jsx";
import "@livekit/components-styles";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const MIC_FAILURE_MESSAGES = {
  [MediaDeviceFailure.PermissionDenied]: "Microphone permission denied — allow mic access in your browser and try again.",
  [MediaDeviceFailure.NotFound]: "No microphone found on this device.",
  [MediaDeviceFailure.DeviceInUse]: "Microphone is already in use by another app.",
  [MediaDeviceFailure.Other]: "Couldn't access the microphone.",
};

const IDLE_HEADLINE = "Talk to Beet";

// One word per agent state, shown as the headline until the agent's first
// transcript line arrives (transcripts take over from there).
const STATE_HEADLINE = {
  connecting: "Connecting…",
  initializing: "Getting ready…",
  listening: "Listening…",
  thinking: "Thinking…",
};

// The orb + headline both read off the same voice-assistant state, so this
// only mounts once actually inside the LiveKit room (state/audioTrack need
// room context) — the idle orb below covers the pre-connect look.
function AgentPanel() {
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const last = agentTranscriptions[agentTranscriptions.length - 1];
  const headline = last?.text ?? STATE_HEADLINE[state] ?? IDLE_HEADLINE;

  return (
    <>
      <div className="agent-orb">
        <AgentAudioVisualizerWave
          size="lg"
          state={state}
          audioTrack={audioTrack}
          color="#7C9473"
          colorShift={0.3}
          lineWidth={2}
        />
      </div>
      <h1 className="agent-headline">{headline}</h1>
    </>
  );
}

export function VoiceButton({ onDisconnect }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState(null);

  const handleMediaDeviceFailure = useCallback(
    (failure) => {
      setError(new Error(MIC_FAILURE_MESSAGES[failure] ?? MIC_FAILURE_MESSAGES[MediaDeviceFailure.Other]));
      setConnection(null);
      onDisconnect?.();
    },
    [onDisconnect]
  );

  const handleClick = useCallback(async () => {
    if (connection) {
      setConnection(null);
      onDisconnect?.();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/livekit-token`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`POST /api/livekit-token failed: ${res.status}`);
      }
      const data = await res.json();
      setConnection({ token: data.token, url: data.url });
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [connection, onDisconnect]);

  return (
    <div className="voice-panel">
      {connection ? (
        <LiveKitRoom
          token={connection.token}
          serverUrl={connection.url}
          connect
          audio
          onMediaDeviceFailure={handleMediaDeviceFailure}
        >
          <RoomAudioRenderer />
          <AgentPanel />
        </LiveKitRoom>
      ) : (
        <>
          <div className="agent-orb agent-orb--idle" aria-hidden="true" />
          <h1 className="agent-headline">{IDLE_HEADLINE}</h1>
        </>
      )}
      <button type="button" className="voice-button" onClick={handleClick}>
        {connection ? "Stop talking to agent" : "Talk to agent"}
      </button>
      {error && <p className="voice-button-error">{error.message}</p>}
    </div>
  );
}
