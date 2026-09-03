# Beet Health — Voice Meal-Logging Agent

Voice-first meal logger for a single fixed user: speak a meal, a LiveKit
voice agent resolves it against a closed 30-food list, writes it to Mongo via
a REST backend, and a read-only React page shows it appear live over SSE.

Full design reasoning (problem statement, approaches considered, decision
audit trail, reviewer passes) lives in
[`docs/designs/voice-meal-logging-agent.md`](docs/designs/voice-meal-logging-agent.md).
Deferred/out-of-scope items and their rationale live in [`TODOS.md`](TODOS.md).

## Architecture

```
voice ──▶ agent/ (LiveKit worker, tool calls)
              │  REST (log/edit/delete/find, agent-status)
              ▼
          backend/ (Express + MongoDB, foods.json resolver)
              │  SSE (meal_logged/updated/deleted, agent_status)
              ▼
          frontend/ (React, read-only meal list + status line)
```

Three independent services, REST/SSE between them — no shared code, no
shared process. Each has its own README with setup/run/test detail:

- [`backend/README.md`](backend/README.md) — Express/MongoDB REST API, food
  resolution (exact/alias/fuzzy/ambiguous), SSE broadcast.
- [`agent/README.md`](agent/README.md) — LiveKit voice agent: six tools
  (log/edit/delete/find/check-quantity/request-confirmation), idempotency
  keys, agent-status lifecycle.
- [`frontend/README.md`](frontend/README.md) — React page: SSE-driven meal
  list + status line, no write path of its own.

## Setup

Everything below is scriptable. The **only** manual step is filling in real
credentials in three `.env` files (LiveKit keys, optionally a remote
`MONGO_URI`) — an AI agent (or a human) can run everything else verbatim.

### Prerequisites

- Node.js 18+ and npm
- A MongoDB instance reachable at a `MONGO_URI` — either:
  - local: `mongod` running on `127.0.0.1:27017` (Homebrew: `brew install mongodb-community && brew services start mongodb-community`; or Docker: `docker run -d -p 27017:27017 --name beet-mongo mongo`), or
  - a remote URI (e.g. MongoDB Atlas)
- A LiveKit Cloud project (free tier works) — `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET` from https://cloud.livekit.io — **required for the
  voice agent**, not needed to run backend/frontend alone
- `foods.json` at the repo root — already present, nothing to do

### 1. Install dependencies (all three services)

\`\`\`bash
(cd backend && npm install)
(cd agent && npm install)
(cd frontend && npm install)
\`\`\`

### 2. Create env files from the examples

\`\`\`bash
cp backend/.env.example backend/.env
cp agent/.env.example agent/.env
cp frontend/.env.example frontend/.env
\`\`\`

Defaults in `backend/.env` and `frontend/.env` work as-is for local dev with
a local Mongo. **Stop here and hand off to a human** (or fill in your own
credentials) for:

- `backend/.env` — `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (only needed if
  the backend mints LiveKit tokens itself), and `MONGO_URI` if not using a
  local Mongo on the default port
- `agent/.env` — `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
  (required — the agent cannot start without these)

Everything else (ports, `BACKEND_URL`, `CORS_ORIGIN`, `VITE_API_BASE_URL`) has
a working default and needs no edits for local dev.

### 3. Start MongoDB (if running locally and not already running)

\`\`\`bash
brew services start mongodb-community   # Homebrew, or:
docker start beet-mongo                 # Docker, or your own equivalent
\`\`\`

### 4. Start the three services, in order, each in its own terminal/process

\`\`\`bash
(cd backend && npm start)     # Express API on :3001 — start first
(cd agent && npm run dev)     # LiveKit voice worker, playground mode — needs backend up
(cd frontend && npm run dev)  # React app on :5173 — needs backend up
\`\`\`

### 5. Verify

\`\`\`bash
curl -sf http://127.0.0.1:3001/api/meals   # backend healthy → returns [] or meal list
open http://localhost:5173                  # frontend UI
\`\`\`

Open the LiveKit playground (link printed by `agent`'s `npm run dev`) to talk
to the voice agent; logged meals should appear live on the frontend page.

### Running tests (no credentials needed)

\`\`\`bash
(cd backend && npm test)   # spins up an in-memory Mongo automatically
(cd agent && npm test)
(cd frontend && npm test)
\`\`\`

Full per-service detail (API reference, architecture, what's implemented) is
in each service's own README, linked above.

## Key decisions

- **REST + SSE over polling or an agent-native data channel** (Approach B) —
  simplest to reason about, no voice-SDK coupling on the frontend. SSE was
  deliberately sequenced *after* the REST core works, so a Day-2 fallback to
  polling would have been a no-op skip, not a rip-out (it wasn't needed —
  SSE shipped).
- **Single fixed user** (`DEFAULT_USER_ID`) — explicit in the schema and every
  query rather than an implicit assumption; no auth.
- **Closed 30-food list** resolved via exact → alias → fuzzy
  (Levenshtein ≤2) → ambiguous/no-match, to absorb ASR mishears without
  false-positive collisions.
- **Delete requires an explicit confirmed turn** (agent-side, no
  server-side confirmation step) — the highest-risk interaction, given
  priority in manual voice testing.
- **Idempotency keys on every write tool call** — a lost/retried LLM tool
  response can't double-log or double-edit a meal.

Full reasoning and the complete decision audit trail (40+ numbered
decisions across CEO/Design/DX/Eng review passes) are in the design doc
linked above.

## Known gaps

See [`TODOS.md`](TODOS.md) for the full, categorized list of deliberately
deferred items (multi-user auth, nutrition analytics, rate limiting, CI/CD,
etc.) with one-line rationale each. Nothing there is forgotten — it was
scoped out on purpose.

## Demo

Manual voice testing (log/edit/delete, ambiguous match, no-match, implausible
quantity, delete-confirmation decline) was run against each service's own
test suite plus LiveKit's playground — see each README's Test section for
the automated coverage. A recorded demo video or public deploy is a
follow-up step, not yet done — needs the user's own LiveKit credentials and
a hosting choice.
