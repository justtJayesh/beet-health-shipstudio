import { VoiceButton } from "./VoiceButton.jsx";
import { StatusLine } from "./StatusLine.jsx";

export function AgentScreen({ agentStatus, onDisconnect }) {
  return (
    <section className="agent-screen">
      <div className="agent-orb" aria-hidden="true" />
      <h1 className="agent-title">Talk to Beet</h1>
      <VoiceButton onDisconnect={onDisconnect} />
      <StatusLine agentStatus={agentStatus} />
    </section>
  );
}
