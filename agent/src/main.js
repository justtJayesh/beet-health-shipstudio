// agent/src/main.js
import "dotenv/config";
import { defineAgent, cli, WorkerOptions, AgentSession, AgentSessionEventTypes, inference } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { buildAgent } from "./agent.js";
import { createBackendClient } from "./backendClient.js";
import { loadFoodsById } from "./quantityGuard.js";

// Maps the SDK's own agent-state lifecycle onto our agent_status SSE event.
// "awaiting_confirmation" is NOT one of the SDK's native states (listening/
// thinking/speaking/idle/initializing) — the agent posts that one explicitly
// itself, right before speaking a delete or quantity confirmation question,
// via backendClient.postAgentStatus directly (see agent.js's tool prompts).
const STATE_MAP = {
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    const backendClient = createBackendClient();
    const foodsById = loadFoodsById();
    const agent = buildAgent({ backendClient, foodsById });

    const session = new AgentSession({
      stt: "auto",
      llm: "openai/gpt-4o-mini",
      tts: "cartesia/sonic-2",
      vad: new inference.VAD(),
    });

    session.on(AgentSessionEventTypes.AgentStateChanged, (event) => {
      const status = STATE_MAP[event.newState];
      if (status) {
        backendClient.postAgentStatus({ status }).catch((err) => {
          console.error("Failed to post agent_status:", err.message);
        });
      }
    });

    await session.start({ agent, room: ctx.room });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
