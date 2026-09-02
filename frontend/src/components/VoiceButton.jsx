import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom, useLocalParticipant, BarVisualizer } from "@livekit/components-react";
import "@livekit/components-styles";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

// Enables the mic the moment the room connects, and visualizes the local
// mic level — lives inside LiveKitRoom so it has room context.
function MicVisualizer() {
  const { microphoneTrack, localParticipant } = useLocalParticipant();

  useEffect(() => {
    localParticipant.setMicrophoneEnabled(true);
  }, [localParticipant]);

  return <BarVisualizer barCount={5} track={microphoneTrack?.track} />;
}

export function VoiceButton({ onDisconnect }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState(null);

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
        <LiveKitRoom token={connection.token} serverUrl={connection.url} connect audio>
          <MicVisualizer />
        </LiveKitRoom>
      )}
    </div>
  );
}
