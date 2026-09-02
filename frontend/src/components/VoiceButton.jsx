import { useCallback, useState } from "react";
import { LiveKitRoom, useLocalParticipant, BarVisualizer } from "@livekit/components-react";
import { MediaDeviceFailure } from "livekit-client";
import "@livekit/components-styles";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const MIC_FAILURE_MESSAGES = {
  [MediaDeviceFailure.PermissionDenied]: "Microphone permission denied — allow mic access in your browser and try again.",
  [MediaDeviceFailure.NotFound]: "No microphone found on this device.",
  [MediaDeviceFailure.DeviceInUse]: "Microphone is already in use by another app.",
  [MediaDeviceFailure.Other]: "Couldn't access the microphone.",
};

// Visualizes the local mic level — lives inside LiveKitRoom so it has room
// context. Mic publish itself is handled by LiveKitRoom's `audio` prop.
function MicVisualizer() {
  const { microphoneTrack } = useLocalParticipant();
  return <BarVisualizer barCount={5} track={microphoneTrack?.track} />;
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
    <div className="voice-button">
      <button type="button" onClick={handleClick}>
        {connection ? "Stop talking to agent" : "Talk to agent"}
      </button>
      {error && <p className="voice-button-error">{error.message}</p>}
      {connection && (
        <LiveKitRoom
          token={connection.token}
          serverUrl={connection.url}
          connect
          audio
          onMediaDeviceFailure={handleMediaDeviceFailure}
        >
          <MicVisualizer />
        </LiveKitRoom>
      )}
    </div>
  );
}
