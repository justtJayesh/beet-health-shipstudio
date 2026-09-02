# Backend (Next Steps #1)

Node/Express/MongoDB backend for the voice meal-logging agent. Voice/LiveKit
and the frontend are separate, later steps — this layer is REST-only and
testable entirely with curl.

## Setup (one-time)

1. `cd backend && npm install`
2. `cp .env.example .env` — the defaults work as-is for local dev; edit only
   if port 3001 or a local Mongo on 27017 are already taken.
3. Make sure `foods.json` exists at the repo root (one level above
   `backend/`) — the server refuses to start without it and tells you the
   exact path it looked for.
4. Have a MongoDB instance reachable at `MONGO_URI` (default:
   `mongodb://127.0.0.1:27017/beet-health`). Any local install or Docker
   `mongo` container works; nothing beyond a running `mongod` is required.

## Run

```bash
npm start
```

You should see `backend listening on :3001`. If you instead see
`MONGO_URI is not set` or a Mongo connection error, fix `.env` or start Mongo
first — both failures are fail-fast with a message naming the problem, never
a silent hang.

## Test

```bash
npm test              # Vitest: unit + integration (spins up an in-memory Mongo, no setup needed)
./scripts/smoke-test.sh   # curl-based smoke test against a running `npm start` instance
```

## API

- `GET /api/foods/resolve?q=<phrase>` — resolves one food phrase against the
  closed 30-food set. Returns `{outcome: "match", food, matchType}` |
  `{outcome: "ambiguous", candidates}` | `{outcome: "no_match"}`.
- `POST /api/meals` — body `{food, quantity, unit, mealType?, idempotencyKey?}`.
  `201` with `{meal}` on success. `422` with `{error: "no_match"|"ambiguous", candidates?}`
  or `{error: "invalid_unit", message}` on a resolution failure. `400` if
  `food`/`quantity`/`unit` are missing. A repeated call with the same
  `idempotencyKey` returns `200` with `{meal, deduped: true}` instead of a
  duplicate.
- `PATCH /api/meals/:id` — body is any subset of `{food, quantity, unit, mealType, loggedAt}`.
  Changing `food` and/or `quantity`/`unit` re-runs the same resolve-and-recompute
  path as logging. `404` if the meal doesn't exist (or isn't the default
  user's). `422` on the same resolution failures as `POST`.
- `DELETE /api/meals/:id` — `200` with `{meal}` (the deleted document) or `404`.
- `GET /api/meals?hours=<N>` or `?since=<ISO8601>` — lists meals for the
  default user, newest first. No query params returns everything.
- `GET /api/events` — Server-Sent Events stream. Emits `{type: "meal_logged"|"meal_updated"|"meal_deleted", meal}`
  on every mutation above.

## What's not here yet

Voice/LiveKit agent (Next Steps #2), frontend (Next Steps #4), and the
`agent_status` SSE event type from the `/autoplan` Final Gate (Decision #43)
— that event is emitted by the agent's tool-call lifecycle, which doesn't
exist until Next Steps #2.
