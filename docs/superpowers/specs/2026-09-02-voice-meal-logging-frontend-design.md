# Design: Voice Meal-Logging Frontend (Next Steps #4)

Branch: main
Status: APPROVED (brainstorming, 2026-09-02)

## Problem Statement

Build the React frontend for `docs/designs/voice-meal-logging-agent.md`'s
Next Steps #4/#5: a read-only page that shows meals logged via the LiveKit
voice agent, live-updating over the backend's existing SSE stream, plus a
plain-text agent status line. Backend (Next Steps #1) and LiveKit agent
(Next Steps #2) are complete and out of scope here except as REST/SSE
consumers.

## Constraints

- Frontend is read-only display — the agent is the only write path
  (design doc Premise 4). No UI edit/delete controls.
- No auth, no multi-user — single `DEFAULT_USER_ID`, nothing to select.
- Agent status is a plain text line (Decision #20) — no pill/badge widget
  (deferred in TODOS.md).
- No meal planning/goals/charts — logging display only.
- SSE reconnect must trigger a refetch (not naive polling) to close the
  gap-fill window (Reviewer Concern #4, already resolved in the design doc).
- Design language adapted from `~/Downloads/DESIGN-2.md` (Cohere extract) —
  palette/type/radius/elevation tokens only; none of its literal marketing
  components (announcement bars, blog chips, hero sections) apply.

## Decisions from brainstorming

1. **List layout:** flat, newest-first (not grouped by day/mealType) —
   matches the literal task scope; mealType shown as a small per-row label
   instead of a grouping key.
2. **CORS:** minimal `cors` middleware added to `backend/src/server.js`.
   Backend had zero CORS config (flagged as a known gap in TODOS.md); this
   is a necessary prerequisite for a separate-origin frontend to call
   `/api/meals` and `/api/events`, not a scope violation of "don't touch
   backend/agent except to consume the API."
3. **Stack:** Vite + React + Vitest + Testing Library — matches the design
   doc's Vitest choice; fast dev loop; SSE/fetch easily mockable in tests.
4. **No UI edit/delete controls** — confirmed against design doc Premise 4
   despite the task prompt's "edit/delete controls" phrasing; the design
   doc is the source of truth and this session's task literally names it
   ("frontend backend/agent... do not touch except to consume").

## Architecture

```
[EventSource '/api/events'] --agent_status, meal_logged/updated/deleted--> [useMealEvents hook]
                                                                                    |
[GET /api/meals?hours=48] --initial load + reconnect refetch-------------------> [useMealEvents hook]
                                                                                    |
                                                                    {meals, agentStatus, error}
                                                                                    |
                                                                              [App]
                                                                             /     \
                                                                    [StatusLine]  [MealList]
                                                                                       |
                                                                                  [MealRow] x N
                                                                                  [EmptyState]
```

## Components

- **`App`** — page shell: header/title, `StatusLine`, `MealList`.
- **`StatusLine`** — plain text from the latest `agent_status` event
  (`"Agent: listening…"`, `"Agent: thinking…"`, `"Agent: speaking…"`,
  `"Agent: awaiting confirmation…"`). No status → no line rendered (agent
  not yet connected this session).
- **`MealList`** — renders `meals` newest-first; renders `EmptyState` when
  empty; renders an inline retry banner on fetch error.
- **`MealRow`** — food name, quantity+unit, macros (calories/protein/
  carbs/fat), mealType label, logged time (local, human-readable).
  Highlighted (background tint, no layout shift) when its `_id` matches
  `agentStatus.targetMealId` and `agentStatus.status === "awaiting_confirmation"`.
- **`EmptyState`** — "No meals logged yet — try the voice agent."
- **`useMealEvents(hours = 48)`** — hook owning the `EventSource` lifecycle:
  - `onopen` (fires on initial connect AND every auto-reconnect) →
    `GET /api/meals?hours=<hours>` → replace meal list state.
  - `onmessage` → parse `{type, meal}` or `{type: "agent_status", status,
    targetMealId?}`; merge meal events into state by `_id` (`meal_logged`
    prepend-if-absent, `meal_updated` replace-by-id, `meal_deleted`
    remove-by-id); `agent_status` events replace a separate `agentStatus`
    state slice, never touch the meals array.
  - Cleans up (`es.close()`) on unmount.
  - Returns `{meals, agentStatus, error, retry}`.

## Data flow / error handling

- Initial fetch failure → `error` set, `MealList` shows a retry banner with
  a button calling `retry()` (re-runs the same fetch); no crash, no blank
  page.
- SSE `onerror` → left to `EventSource`'s built-in auto-reconnect; we only
  react on `onopen`, which fires again after a successful reconnect —
  this is the "reconnect-triggered refetch," not manual retry logic.
- Malformed/unknown SSE event `type` → ignored (forward-compatible, no throw).
- Backend's known gap (dead-socket `broadcast()` can throw and abort
  delivery to other clients, per TODOS.md) is a backend concern, not
  addressed here.

## Styling (DESIGN-2.md adapted)

- Canvas: white (`#ffffff`), body text `ink` (#212121).
- Type: body copy in `Unica77 Cohere Web` → `Inter` → `system-ui` fallback
  stack, per the design system's documented fallback; status line and
  mealType label in the `mono-label` face (`CohereMono` → `Arial` →
  `system-ui`) for a technical/system feel — this is the one place a
  "system status" reads correctly in this design language.
- Header title: `near-black` (#17171c), tightened tracking, feature-heading
  scale (24px) — not the 96px hero scale, which doesn't map onto a utility
  page.
- Rows: `hairline` (#d9d9dd) 1px bottom border, no cards/shadows — matches
  "Bordered" elevation level, not "Media Lift."
- Radius: `xs` (4px) on the retry-banner button only; nothing else needs
  rounding at this content density.
- No pill CTAs, no coral/blue accents — nothing here is a taxonomy or a
  primary marketing action; a retry button is the only interactive element
  and stays a plain bordered button (`button-secondary`-style, text only).

## Testing (Vitest + Testing Library)

- `useMealEvents`: mocked `EventSource` + `fetch` —
  - initial load populates `meals`
  - `meal_logged`/`meal_updated`/`meal_deleted` merge correctly by `_id`
  - `agent_status` updates `agentStatus`, leaves `meals` untouched
  - `onopen` firing a second time (simulated reconnect) triggers a refetch
  - fetch failure sets `error`, `retry()` clears it on success
- `MealRow`: renders macros/mealType/time; highlights when `targetMealId`
  matches and status is `awaiting_confirmation`; no highlight otherwise.
- `MealList`: newest-first order; `EmptyState` when `meals` is empty; retry
  banner when `error` is set.
- `StatusLine`: renders correct text per status; renders nothing when
  `agentStatus` is null.
- Backend: one test asserting CORS headers are present on an `/api/meals`
  response (guards the new middleware).

## Out of scope (confirmed against TODOS.md)

- UI edit/delete controls (Premise 4).
- Pagination/infinite scroll, dark mode, i18n, animated status widget —
  already listed in TODOS.md as deferred.
- Any change to `agent/` or `backend/` beyond the one CORS middleware line.
