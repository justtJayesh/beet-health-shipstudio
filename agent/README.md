# Voice Agent (Next Steps #2)

LiveKit voice agent for the Beet meal-logging assistant. Talks to the
backend (Next Steps #1) over REST — this layer has no database access of
its own.

## Setup

1. `cd agent && npm install`
2. `cp .env.example .env` and fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET` from your LiveKit Cloud project. `BACKEND_URL`
   defaults to `http://127.0.0.1:3001` — only change it if the backend runs
   somewhere else.
3. Make sure the backend (`../backend`) is running first — `npm start` in
   that directory, per `backend/README.md`.

## Run

```bash
npm run dev     # LiveKit's local dev/playground mode — test via text or voice
npm start       # production worker mode
```

Use LiveKit's text/playground mode first to exercise log/edit/delete
conversationally before testing with real voice, per the design doc's own
Next Steps #2.

## What it does

Exposes six tools to the LLM: `log_meal`, `edit_meal`, `delete_meal`,
`find_recent_meals`, `check_quantity_plausible`, and `request_confirmation`
(called right before the agent speaks a delete or quantity confirmation
question, so the app can show `awaiting_confirmation` while it asks and
while it waits for the answer). Every `log_meal`/`edit_meal`
call carries a fresh idempotency key so a lost/retried tool-call response
never double-writes. Deleting a meal requires an explicit confirmed turn —
the system prompt enforces this, there's no server-side confirmation step.

Agent state (listening/thinking/speaking, plus an explicit
`awaiting_confirmation` before delete/quantity confirmations) is pushed to
`POST /api/agent-status` on the backend, which broadcasts it over the
existing SSE channel as an `agent_status` event — the frontend (Next Steps
#4) renders this as a status line.

## Test

```bash
npm test   # Vitest: quantityGuard + backendClient unit tests
```

Real voice interaction (full round trip, delete-confirmation flow) is
manual/LiveKit-playground testing, not automated — see the design doc's Test
Coverage Diagram.

## What's not here yet

Frontend (Next Steps #4) to render the `agent_status` line and meal list.
Specific STT/LLM/TTS model tuning beyond the defaults in `main.js` — swap
`stt`/`llm`/`tts` in `AgentSession(...)` for a different LiveKit Inference
model string if the defaults sound wrong once real voice testing starts.
