const STATUS_TEXT = {
  listening: "Agent: listening…",
  thinking: "Agent: thinking…",
  speaking: "Agent: speaking…",
  awaiting_confirmation: "Agent: awaiting confirmation…",
};

export function StatusLine({ agentStatus }) {
  if (!agentStatus) {
    return null;
  }

  const text = STATUS_TEXT[agentStatus.status] ?? `Agent: ${agentStatus.status}`;

  return <p className="status-line">{text}</p>;
}
