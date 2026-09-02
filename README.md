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

## Setup (in order)

1. Copy the assignment's `foods.json` into the repo root (already present in
   this repo).
2. `backend/` — see its README. Needs a running MongoDB.
3. `agent/` — see its README. Needs a LiveKit Cloud project
   (`LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`) plus the backend
   running.
4. `frontend/` — see its README. Needs the backend running.

Start order for a full local run: MongoDB → `backend` (`npm start`) →
`agent` (`npm run dev`, LiveKit playground) → `frontend` (`npm run dev`).

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
