import { AuraPlaceholder } from "./AuraPlaceholder.jsx";
import { StatusLine } from "./StatusLine.jsx";

export function AgentScreen({ agentStatus }) {
  return (
    <section className="agent-screen">
      <AuraPlaceholder />
      <h1 className="agent-title">Talk to Beet</h1>
      <StatusLine agentStatus={agentStatus} />
    </section>
  );
}
