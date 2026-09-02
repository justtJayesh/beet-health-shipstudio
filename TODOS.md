# TODOS

Deferred/out-of-scope items surfaced across the `/autoplan` review pipeline
for `docs/designs/voice-meal-logging-agent.md` (Phase 1 CEO, Phase 2 Design,
Phase 2.5 DX, Phase 3 Eng — final gate). Each item was deliberately deferred,
not forgotten. Full reasoning lives in the plan file's review sections;
these are one-line rationales for quick scanning.

## From Phase 1 (CEO Review)

- **Multi-user auth/accounts** — Deferred per Premise 5 (single fixed user is
  the assignment's own scope); only relevant if this becomes a real
  multi-user product.
- **Meal planning, nutrition targets/goals, historical analytics/charts** —
  Outside the assignment's 3-feature scope (log/edit/delete only).
- **Deployment CI/CD pipeline** — This is a GitHub-repo submission; the
  deploy-or-video choice is deferred to post-build, time-permitting.
- **Rate limiting / abuse protection on the API** — Single fixed user, not
  internet-facing by default; would matter only if deployed publicly (see
  the Phase 3 deploy-security note below, which is a *related* but separate
  concern — a minimum guard if deploying, not full rate limiting).
- **Fuzzy-match threshold tuning beyond distance ≤2** — Already resolved to
  a pre-build sanity check against the real 30-food alias list (Step 0D #1),
  not a redesign; revisit only if the real data shows false-positive
  collisions in practice.

## From Phase 2 (Design Review)

- **Full LiveKit-room-state UI** (an animated "listening/thinking/speaking"
  widget) — Even if Decision #20 (still unresolved — see plan's Unresolved
  Decisions) resolves to "surface agent state," a plain text status line is
  the ceiling for this scope; a polished animated widget is a separate,
  deferred upgrade.
- **Multi-day pagination / infinite scroll** — A single user's meal volume
  (a handful per day) doesn't warrant it at this scale.
- **Visual theming, color system, or typography** beyond the universal
  accessibility minimums (16px+ body text, 4.5:1 contrast) — No DESIGN.md
  exists; fabricating one for a scope explicitly marked "no design polish
  required" would be scope invention, not a fix.
- **Dark mode, i18n/RTL** — Outside the assignment's stated scope; neither
  review voice raised it as a gap.

## From Phase 2.5 (DX Review)

- **Interactive playground/sandbox for the REST API** — A documented curl
  sequence covers the same need at near-zero cost for a single-grader
  take-home.
- **SDK/client library for the REST API** — No third-party consumers exist
  or are planned.
- **CI/CD pipeline validation of the getting-started flow** — Already
  correctly deferred per Phase 1's deploy/CI-CD decision above.
- **Community channels, contributing guide, plugin ecosystem** — Not
  applicable to a single-submission take-home.

## From Phase 3 (Eng Review — Final Gate)

- **Load/concurrency testing across simultaneous voice sessions** —
  Single-user system by design (Premise 5); only relevant if that
  assumption is ever relaxed.
- **A dedicated distributed idempotency-key store** — The idempotency fix
  added this phase (a dedup field with a short TTL window on the existing
  `Meal` document) is sufficient at this scale; a separate idempotency
  service would be over-engineering for a single-user 3-day build.
- **Full audit logging** (who/when/what changed with a diff) beyond the
  one-line-per-tool-call logging already planned (Phase 1 Section 8) —
  overkill for a single-user take-home; the planned log line already gives
  enough debuggability for the 3-day build itself.
- **Deploy-time CORS configuration and a full auth layer for the deployed
  instance** — Only relevant if the "plus one" deploy option is taken.
  Phase 3 strengthened this from a README footnote to a minimum
  shared-secret guard *if* deploying publicly (see the plan's Phase 3 TASTE
  DECISIONS) — full auth is still correctly out of scope for a take-home,
  the guard is the cheap middle ground.
- **Server-timezone-as-user-timezone assumption** for `mealType` inference —
  Acceptable for local dev/single-user demo; would silently misclassify
  breakfast/lunch/dinner boundaries if deployed to a different region.
  Already named in the plan's own Open Questions as a README "what I'd do
  differently" item; not worth solving for this scope.

## Resolved blockers (were tracked here as open, now closed)

1. `foods.json` — copied into the repo root (2026-09-02), verified 30 entries
   matching the design doc's shape. No longer blocking.
2. Decision #20 (agent status visibility) — resolved at the `/autoplan`
   Final Gate to a plain-text status line + new `agent_status` SSE event.
   Spec written into the plan doc. Implementation is Next Steps #2's job
   (the LiveKit agent doesn't exist yet); the backend's SSE broadcast hub
   (Task 5 of the backend-scaffold plan) already supports adding it with
   zero changes — it broadcasts arbitrary event objects.

## From the backend-scaffold implementation (2026-09-02, branch feat/backend-scaffold)

Deferred Minors from per-task reviews and the final whole-branch review —
full reasoning lives in `.superpowers/sdd/2026-09-02-backend-scaffold/progress.md`
before that workspace is deleted; one-line rationales here for quick scanning.

- **`test/models/Meal.test.js` hardcodes `"default-user"`** instead of
  importing `DEFAULT_USER_ID` from `constants.js` — cosmetic, low risk since
  the value is unlikely to change.
- **No test asserts required-field rejection** for `foodId`/`name`/`unit`/
  `loggedAt`/`macros` sub-fields on the `Meal` schema — not requested by the
  plan's test list, a coverage gap only if graded against full schema
  validation.
- **No test for the `foods.json` ENOENT fail-fast error message itself** —
  low value since the real `foods.json` is committed and present.
- **No test for the fuzzy threshold=2 path** (queries >5 chars) inside
  `resolveFood` itself, or for 3+-candidate ambiguity — `fuzzyThreshold` is
  unit-tested directly; the >5-char path through `resolveFood` isn't.
- **`resolveMealFields`'s own test file doesn't directly trigger `ambiguous`**
  — relies on `foodsResolver.js`'s own tests covering that outcome.
- **No route-level test for the `ambiguous` outcome** on
  `GET /api/foods/resolve` — covered at the `foodsResolver.js` unit level
  instead.
- **`smoke-test.sh`'s `_id`-extraction regex is loose** (could match an
  empty string) but is guarded by a downstream non-empty check; no smoke-test
  case for `ambiguous` or SSE streaming (out of the task's scope).
- **SSE `broadcast()` doesn't guard `res.write`** on a dead client socket —
  one dead connection can throw and abort delivery to every remaining
  client, and since `broadcast` runs before the response is sent in all
  three mutating handlers, that throw surfaces as an unexpected 500 on an
  otherwise-successful write. Cheap fix (`try/catch` + drop the client) if
  it ever gets exercised in practice.
- **No SSE heartbeat or `retry:` hint** — an idle `/api/events` stream can
  die to an intermediary connection timeout with no reconnect signal beyond
  the client's own `EventSource` default. Trivial `setInterval` ping if
  deployed behind a proxy that times out idle connections.
- **No CORS configured anywhere in the backend.** Not needed yet (nothing
  cross-origin exists), but the frontend (Next Steps #4) will very likely
  run on a different origin/port than the backend, so `/api/events` and
  every REST route will need a CORS policy before the frontend can call
  them directly from a browser. Flagging now so it isn't discovered as a
  surprise at frontend-integration time.
- **`quantity: 0` is accepted** (schema has `min: 0`, not an exclusive
  minimum) — produces a `201` with 0 grams and all-zero macros, which is a
  meaningless meal entry. Distinct from the quantity *upper*-bound soft
  confirm (Decision #37 / Next Steps #2, an agent-side spoken behavior) —
  this is a lower-bound gap in the backend schema itself.
- **`InvalidUnitError` doesn't carry the food's valid units** in its
  response — a client that guesses an invalid unit has to make a second
  `/api/foods/resolve` call to discover the valid ones. Cheap to attach to
  the existing error response if it becomes a real friction point.
- **`import.meta.url === \`file://${process.argv[1]}\`` direct-run check**
  in `server.js` is fragile to paths containing spaces or non-ASCII
  characters. `pathToFileURL(process.argv[1]).href` is the more robust
  comparison; low priority since the deployment path is unlikely to hit
  this edge case.
- **Partial unique index on `{userId, idempotencyKey}` builds asynchronously**
  under Mongoose's `autoIndex` — a `POST` in the first moments after boot
  could theoretically land before the index finishes building, degrading
  idempotency protection down to the route's own check-then-create pre-check
  alone (which is still correct in the common case, just not backstopped by
  the DB constraint for a brief window). Immaterial at this project's scale;
  worth knowing if it's ever deployed with meaningful concurrent load
  immediately at boot.
- **`quantity: ""` (empty string) slips through the new finite-number guard**
  as `Number("") === 0`, which is finite — so it's accepted as `quantity: 0`
  rather than rejected as a missing/invalid value. Pre-existing gap, adjacent
  to (but not the same as) the `quantity: 0` minimum-bound item above;
  low priority, same fix would likely resolve both.
- **Generic `bad_request` error code** used for the `err.status`/
  `err.statusCode` branch in the error middleware (covers things like
  malformed-JSON-body errors from body-parser) — no more specific code was
  specified for this branch. Could be refined to a more granular code per
  actual cause if the voice agent (Next Steps #2) needs to distinguish them,
  but `message` already carries the specifics for now.

## From the LiveKit agent implementation (2026-09-02)

- **Design doc's Test Stack section says pytest for a Python agent** — the
  agent was built in Node.js instead (design doc left language open; Node
  matches the backend's runtime and reuses its Vitest stack). The design
  doc's Test Stack line is now stale; corrected via the LiveKit agent design
  spec (`docs/superpowers/specs/2026-09-02-livekit-voice-agent-design.md`),
  not fixed in the original design doc itself to avoid rewriting review
  history that was written against the Python assumption.
- **STT/LLM/TTS model choice** (`stt: "auto"`, `llm: "openai/gpt-4o-mini"`,
  `tts: "cartesia/sonic-2"` in `agent/src/main.js`) — placeholder defaults,
  per the design doc's own Open Questions ("deferred to implementation").
  Swap during real voice testing if these sound wrong.
