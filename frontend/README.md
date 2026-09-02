# Frontend (Next Steps #4)

Read-only React page showing meals logged via the LiveKit voice agent,
live-updating over the backend's SSE stream. The voice agent is the only
write path — this page has no edit/delete controls.

## Setup

1. `cd frontend && npm install`
2. `cp .env.example .env` — defaults to `http://localhost:3001`, matching
   the backend's default port. Edit if your backend runs elsewhere.
3. Make sure the backend (`../backend`) is running first — `npm start`
   there, per its own README.

## Run

```bash
npm run dev
```

Opens on `http://localhost:5173` by default.

## Test

```bash
npm test
```

## What's here

- `src/hooks/useMealEvents.js` — owns the SSE connection + fetch-on-connect/
  reconnect logic.
- `src/components/` — `StatusLine` (plain-text agent status),
  `MealList`/`MealRow`/`EmptyState` (read-only meal display).
- No routing, no state library — one page, one hook.
