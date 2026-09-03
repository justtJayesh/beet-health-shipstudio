import { VoiceButton } from "./VoiceButton.jsx";
import { StatusLine } from "./StatusLine.jsx";

// The voice-assistant orb/headline already cover listening/thinking/speaking
// live from LiveKit — StatusLine only adds something new for the
// awaiting-confirmation case, which is backend-side (delete/edit confirm),
// not part of the raw voice-assistant state.
export function AgentScreen({ agentStatus, onDisconnect }) {
  const showStatus = agentStatus?.status === "awaiting_confirmation";

  return (
    <section className="agent-screen">
      <VoiceButton onDisconnect={onDisconnect} />
      {showStatus && <StatusLine agentStatus={agentStatus} />}
    </section>
  );
}
