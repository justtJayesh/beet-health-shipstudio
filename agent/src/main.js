// agent/src/main.js
import "dotenv/config";
import { defineAgent, cli, WorkerOptions, AgentSession, AgentSessionEventTypes, inference } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { buildAgent } from "./agent.js";
import { createBackendClient } from "./backendClient.js";
import { loadFoodsById } from "./quantityGuard.js";

// Maps the SDK's own agent-state lifecycle onto our agent_status SSE event.
// "awaiting_confirmation" is NOT one of the SDK's native states (listening/
// thinking/speaking/idle/initializing). main.js is the SOLE writer of
// agent_status: while agent.js's confirmationState reports a confirmation is
// pending (set by request_confirmation's execute, cleared the moment
// log_meal/edit_meal/delete_meal actually runs), every state change is
// reported as awaiting_confirmation instead of the SDK's native state — this
// keeps it on screen through both "asking the question" (speaking) and
// "waiting for the answer" (listening), per Decision #43. See Fix 1 in the
// final review: request_confirmation used to post agent_status itself,
// racing with this handler and losing within milliseconds.
const STATE_MAP = {
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

export default defineAgent({
  // Loads the VAD model once per worker process instead of once per job —
  // without this, every "Talk to agent" click pays full VAD init cost before
  // the session can start listening, on top of normal room-join time.
  prewarm: (proc) => {
    proc.userData.vad = new inference.VAD();
  },
  entry: async (ctx) => {
    await ctx.connect();

    const backendClient = createBackendClient();
    const foodsById = loadFoodsById();
    const { agent, confirmationState } = buildAgent({ backendClient, foodsById });

    const session = new AgentSession({
      stt: "auto",
      llm: "openai/gpt-4o-mini",
      tts: "cartesia/sonic-2",
      vad: ctx.proc.userData.vad,
      // Turn-taking tuned for the delete-confirmation moment (highest-risk per
      // the design doc): minWords requires at least one transcribed word before
      // counting speech as a real interruption, so a cough/breath/background
      // noise while the agent reads back "delete X, confirm?" can't cut it off
      // (default minWords:0 lets duration alone trigger a false barge-in).
      // Endpointing/backchannel defaults are left as-is — SDK defaults already
      // suppress backchannels near turn boundaries; changing them further needs
      // a live mic pass to avoid guessing at numbers no one has heard.
      turnHandling: {
        interruption: { minWords: 1 },
      },
    });

    session.on(AgentSessionEventTypes.AgentStateChanged, (event) => {
      const status = confirmationState.pending
        ? "awaiting_confirmation"
        : STATE_MAP[event.newState];
      if (!status) return;
      const targetMealId = confirmationState.pending ? confirmationState.pendingTargetMealId : undefined;
      backendClient.postAgentStatus({ status, targetMealId }).catch((err) => {
        console.error("Failed to post agent_status:", err.message);
      });
    });

    await session.start({ agent, room: ctx.room });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
