# Design: LiveKit Voice Agent (Next Steps #2)

Scaffolds the LiveKit voice agent for the Beet meal-logging assistant
(`docs/designs/voice-meal-logging-agent.md`). Backend REST API (Next Steps
#1) is already built and is the leverage point for everything here — see
`backend/README.md` for the existing endpoints.

## Scope

Build the LiveKit agent that turns spoken meal-logging requests into calls
against the existing backend, plus two small backend additions this work
depends on. Frontend (Next Steps #4) is out of scope.

## Language/runtime

**Node.js**, using the LiveKit Agents JS SDK (`@livekit/agents`). The design
doc leaves language open ("agent's choice of language/runtime within
LiveKit's support"); Node matches the backend's existing runtime, avoids a
second toolchain, and lets tests run on the same Vitest stack already used
in `backend/`. This supersedes the design doc's Test Stack section, which
names pytest for a Python agent — that line is now stale and should be
corrected as part of this work (mechanical doc-drift fix, not a scope
change, per the same precedent as Decision #32/#33 in the design doc's own
Eng Review).

## Backend additions (bundled into this work)

1. **`POST /api/agent-status`** — new route. Body
   `{status: "listening"|"thinking"|"speaking"|"awaiting_confirmation", targetMealId?}`.
   Validates `status` against the enum, calls the existing generic
   `broadcast({type: "agent_status", status, targetMealId})` from
   `backend/src/sse/broadcast.js` (already supports arbitrary event
   objects — no broadcast-layer changes needed), returns `204`. This is the
   plumbing Decision #43 (agent_status SSE event) specified but that
   Next Steps #1 correctly deferred since the agent didn't exist yet.
2. **Idempotency on `PATCH /api/meals/:id`** — currently only
   `POST /api/meals` checks/stores `idempotencyKey` (see
   `backend/src/routes/meals.js`); the `Meal` schema and its partial unique
   index (`{userId, idempotencyKey}`) already support this generically.
   Mirror the POST pattern: accept `idempotencyKey` in the PATCH body,
   check-then-update, catch the `E11000` race the same way POST does,
   return `200 {meal, deduped: true}` on a repeat. Closes the gap between
   Decision #34 (idempotency on both `log_meal` and `edit_meal`) and the
   as-shipped backend, which only wired it for logging.

## Agent architecture

```
[LiveKit room: user voice] <--STT/LLM/TTS--> [Node LiveKit Agent]
                                                    |
                                          fetch() calls (backendClient.js)
                                                    v
                                          [Express backend :3001]
                                    POST/PATCH/DELETE/GET /api/meals,
                                    NEW: POST /api/agent-status
```

New top-level `agent/` directory, sibling to `backend/`, own `package.json`.

### Components

- `agent/src/main.js` — worker entrypoint; `AgentSession` wiring with
  LiveKit Inference STT/LLM/TTS (design doc's default recommendation — no
  specific model pinned here, deferred to implementation per the design
  doc's own Open Questions).
- `agent/src/agent.js` — `Agent` definition: system prompt (closed 30-food
  scope only, confirm-before-delete rule, quantity-threshold rule) and
  tool definitions.
- `agent/src/backendClient.js` — thin `fetch` wrapper exposing `logMeal`,
  `editMeal`, `deleteMeal`, `listMeals`, `postAgentStatus`. Owns
  idempotency-key generation (`crypto.randomUUID()` per `logMeal`/`editMeal`
  call, per Decision #34).
- `agent/src/quantityGuard.js` — pure function
  `isImplausible(foodId, quantity, unit)`. Threshold: quantity converts to
  more than 5× the food's largest listed unit gram-weight (e.g. a "piece"
  of roti is 40g; 5 pieces' worth ≈ 200g threshold). Reads the repo-root
  `foods.json` once at boot — no new data file, no edits to the
  assignment-provided asset (per Decision #37's requirement for a
  per-food threshold, without inventing new fields on a given source-of-
  truth file).
- `agent/.env.example` — `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`, `BACKEND_URL`. No real credentials are provided by
  this work; the user fills them in before first run (LiveKit Cloud
  account setup is unavailable to this session).

### Tools exposed to the LLM

- **`log_meal(food, quantity, unit, meal_type?)`** — calls
  `POST /api/meals` with a generated idempotency key. Backend already
  returns structured `no_match` / `ambiguous` / `invalid_unit` /
  `invalid_quantity` outcomes (422/400) — the tool returns these verbatim
  so the LLM narrates them conversationally; no separate `resolve_food`
  tool is exposed, since resolution is already folded into this endpoint.
  `quantityGuard.isImplausible` is checked **before** the tool fires; if
  true, the system prompt directs the agent to ask the user to confirm the
  quantity first — the tool call itself only happens after that confirmed
  turn (mirrors the delete-confirmation pattern, per Decision #37).
- **`edit_meal(meal_id, food?, quantity?, unit?, meal_type?, logged_at?)`**
  — `PATCH /api/meals/:id`, same idempotency-key pattern (depends on the
  backend addition above).
- **`delete_meal(meal_id)`** — `DELETE /api/meals/:id`. The system prompt
  mandates an explicit confirmed spoken turn before this tool is ever
  invoked. There is no separate "confirm" tool — confirmation is a
  natural-language gate the LLM enforces in conversation, matching the
  design doc's "no partial writes; tool call only fires after an explicit
  confirmed turn" rule (line 65).
- **`find_recent_meals(hours?)`** — `GET /api/meals?hours=`. Lets the LLM
  resolve a spoken reference ("the chai I just logged", "my last entry")
  to a concrete `meal_id` before calling `edit_meal`/`delete_meal`.

Multi-item utterances (e.g. "I had a roti and dal") result in one
`log_meal` call per item, satisfying Decision #35 (per-item success/failure
reporting) without any special-casing in the tool layer — each call
independently succeeds, dedupes, or fails, and the LLM reports on each by
name rather than the utterance as a whole.

### `agent_status` threading

Each tool invocation brackets itself with `backendClient.postAgentStatus`
calls: `"thinking"` before the backend call, `"speaking"` after a result
comes back (while the LLM composes/speaks its response), `"listening"` as
the idle default between user turns, and `"awaiting_confirmation"` +
`targetMealId` immediately before the agent speaks a delete (or
quantity-sanity) confirmation question. Implementation detail (explicit
calls inside each tool vs. a turn-lifecycle SDK hook) is decided during
implementation based on what the LiveKit Agents JS SDK exposes — if a clean
lifecycle hook exists, it centralizes this; otherwise each tool method
makes the calls explicitly. Either way the behavior contract (the four
states, with `targetMealId` set only during confirmation) is fixed by this
spec.

### System prompt scope constraint

The prompt names the 30-food set explicitly (loaded from `foods.json` at
boot, not hardcoded as prose) and instructs the agent to only log foods
resolvable against that set — anything outside it is a `no_match` from
`log_meal`, which the agent reports as "that's not in the food list"
rather than attempting a fuzzy guess of its own.

## Testing

Vitest, matching the backend's existing test stack:

- `agent/test/quantityGuard.test.js` — pure function, no mocks. Cases:
  within threshold, at threshold boundary, over threshold, across a couple
  of different foods/units to confirm the per-food (not per-unit-type)
  basis works.
- `agent/test/backendClient.test.js` — mocked `fetch` (e.g.
  `vi.stubGlobal("fetch", ...)`). Covers: idempotency key is attached and
  is a valid UUID, `deduped: true` response is surfaced distinctly from a
  fresh `201`/`200`, each of the 400/404/422 error shapes is passed through
  rather than thrown/swallowed.
- Backend additions get their own tests alongside the existing
  `backend/test/` suite: `POST /api/agent-status` (valid status broadcasts,
  invalid status 400s), PATCH idempotency (repeat call with same key
  returns `deduped: true`, no second document created).

Real voice interaction (full round trip, delete-confirmation flow) stays
manual/LiveKit-playground testing per the design doc's own Next Steps #2
and Test Coverage Diagram — not unit-testable, and this spec doesn't
pretend otherwise.

## Out of scope

Everything already listed in `TODOS.md` under "NOT in scope" continues to
apply (multi-user auth, meal planning/analytics, deploy CI/CD, rate
limiting, full LiveKit-room-state UI polish, etc.). Additionally, out of
scope for this specific piece of work:

- Real LiveKit credentials/account setup — user-owned action, not
  automatable.
- Specific STT/LLM/TTS model selection within LiveKit Inference — deferred
  to implementation, default to LiveKit's recommended stack per the design
  doc's Open Questions.
- Frontend `agent_status` rendering (the text line + row highlight) — that
  is Next Steps #4's job; this spec only ensures the event reaches the SSE
  channel.
