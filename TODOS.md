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

## Not deferred — currently blocking (tracked in the plan, not here)

Two items are **not** on this list because they are not deferred work — they
are open blockers that must be resolved before implementation, tracked in
the plan file's "QUEUED USER CHALLENGES" and "Unresolved Decisions":

1. `foods.json` is still not copied into the repository (flagged 3 times:
   Phase 1, Phase 2.5, Phase 3).
2. Decision #20 — whether the frontend surfaces LiveKit room/agent state —
   remains unresolved since Phase 2.
