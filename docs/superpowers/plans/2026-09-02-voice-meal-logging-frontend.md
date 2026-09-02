# Voice Meal-Logging Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only React frontend (`frontend/`) that shows meals logged by the LiveKit voice agent, live-updating over the backend's SSE stream, with a plain-text agent status line.

**Architecture:** Vite + React SPA. A single `useMealEvents` hook owns an `EventSource` subscription to `GET /api/events` and an initial/reconnect `GET /api/meals` fetch, merging deltas into state. `App` renders `StatusLine` + `MealList` from that hook's output. One CORS middleware line added to the existing Express backend so the browser can call it cross-origin in dev.

**Tech Stack:** Vite, React 18, Vitest, @testing-library/react, jsdom. Backend: `cors` npm package (one new dependency).

**Spec:** `docs/superpowers/specs/2026-09-02-voice-meal-logging-frontend-design.md`

## Global Constraints

- Frontend is read-only — no UI edit/delete controls (spec Decision #4 / design doc Premise 4).
- Agent status is plain text only — no pill/badge widget (design doc Decision #20, TODOS.md).
- Single `DEFAULT_USER_ID`, no auth, no user selector.
- SSE reconnect must trigger a refetch, not naive polling (spec, design doc Reviewer Concern #4).
- Only backend touch allowed: minimal `cors` middleware in `backend/src/server.js` (spec Decision #2).
- Meal list is flat, newest-first — not grouped by day/mealType (spec Decision #1).
- Backend API shapes (verified against `backend/src/server.js`, `backend/README.md`):
  - `GET /api/meals?hours=<N>` → `200` array of meal docs, newest-first. Meal doc shape: `{_id, userId, foodId, name, quantity, unit, grams, macros: {calories, protein, carbs, fat}, mealType, loggedAt, createdAt, updatedAt}`.
  - `GET /api/events` → SSE stream, each event is `data: <json>\n\n` where json is `{type: "meal_logged"|"meal_updated"|"meal_deleted", meal}` or `{type: "agent_status", status: "listening"|"thinking"|"speaking"|"awaiting_confirmation", targetMealId?}`.
  - Backend runs on `PORT` env, default `3001` (see `backend/.env.example`).

---

## File Structure

```
frontend/
  package.json
  vite.config.js
  vitest.setup.js
  index.html
  src/
    main.jsx
    App.jsx
    App.test.jsx
    components/
      StatusLine.jsx
      StatusLine.test.jsx
      MealRow.jsx
      MealRow.test.jsx
      MealList.jsx
      MealList.test.jsx
      EmptyState.jsx
    hooks/
      useMealEvents.js
      useMealEvents.test.js
    styles.css
backend/
  src/server.js       (modify: add cors middleware)
  src/server.test.js   (modify: add CORS header assertion, OR create if none exists)
  package.json         (modify: add cors dependency)
```

Check for an existing `backend/src/server.test.js` (or similarly-named integration test file) before Task 1 — if one exists, add the CORS assertion there instead of creating a new file.

---

### Task 1: Backend CORS middleware

**Files:**
- Modify: `backend/package.json` (add `cors` dependency)
- Modify: `backend/src/server.js` (add middleware, ~3 lines)
- Modify or create: `backend/src/server.test.js` (or existing integration test file — check first)

**Interfaces:**
- Produces: `backend/src/server.js`'s `createApp()` now returns an app with CORS enabled on all routes (no change to `createApp()`'s signature or existing exports).

- [ ] **Step 1: Install the dependency**

```bash
cd backend && npm install cors
```

- [ ] **Step 2: Check for an existing integration test file to extend**

```bash
ls backend/src/*.test.js backend/test 2>/dev/null
```

If a file exists that spins up `createApp()` and makes a `supertest`-style or raw `fetch`-against-`app` request, use that pattern below. If none exists, check how other route tests instantiate the app (e.g. `backend/src/routes/*.test.js`) and copy that pattern exactly — do not invent a new test-setup style.

- [ ] **Step 3: Write the failing test**

Add to the test file chosen in Step 2 (adapt the app-instantiation lines to match the existing pattern found there — this example assumes `supertest`, swap for whatever the existing route tests use):

```javascript
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "./server.js";

describe("CORS", () => {
  it("sets Access-Control-Allow-Origin on API responses", async () => {
    const app = createApp();
    const res = await request(app).get("/api/meals").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBeTruthy();
  });
});
```

If `supertest` isn't already a devDependency, check `backend/package.json` — if missing, use whatever HTTP-testing approach the existing route tests already use instead (e.g. starting the app with `app.listen(0)` and using `fetch`). Do not add `supertest` as a new dependency; match the existing pattern.

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx vitest run src/server.test.js`
Expected: FAIL — no `access-control-allow-origin` header present.

- [ ] **Step 5: Add the middleware**

In `backend/src/server.js`, add the import near the top:

```javascript
import cors from "cors";
```

And add as the first `app.use(...)` call inside `createApp()`, before `app.use(express.json())`:

```javascript
app.use(cors());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run src/server.test.js`
Expected: PASS

- [ ] **Step 7: Run full backend suite to confirm no regression**

Run: `cd backend && npm test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/server.js backend/src/server.test.js
git commit -m "feat(backend): add CORS so the frontend can call the API cross-origin"
```

---

### Task 2: Scaffold the Vite + React + Vitest frontend project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/vitest.setup.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/.env.example`

**Interfaces:**
- Produces: `import.meta.env.VITE_API_BASE_URL` — the backend base URL every later task's `fetch`/`EventSource` calls read from. Defaults to `http://localhost:3001` when unset.
- Produces: a running `npm run dev` (Vite dev server) and `npm test` (Vitest) in `frontend/`.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "beet-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.1",
    "vite": "^5.4.8",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend && npm install
```

- [ ] **Step 3: Create `frontend/vite.config.js`**

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.js",
    globals: true,
  },
});
```

- [ ] **Step 4: Create `frontend/vitest.setup.js`**

```javascript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Beet — Meal Log</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `frontend/src/main.jsx`**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create `frontend/src/styles.css`**

```css
:root {
  --color-canvas: #ffffff;
  --color-ink: #212121;
  --color-near-black: #17171c;
  --color-hairline: #d9d9dd;
  --color-muted: #75758a;
  --color-error: #b30000;
  --radius-xs: 4px;
  --font-body: "Unica77 Cohere Web", "Inter", system-ui, sans-serif;
  --font-mono: "CohereMono", "Arial", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
}

.app {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}

.app-title {
  color: var(--color-near-black);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.32px;
  margin: 0 0 8px;
}

.status-line {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.28px;
  color: var(--color-muted);
  margin: 0 0 24px;
}

.meal-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-hairline);
}

.meal-row.highlighted {
  background: #fff8f6;
}

.meal-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meal-row-name {
  font-weight: 500;
}

.meal-row-meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
}

.meal-row-macros {
  font-size: 14px;
  color: var(--color-muted);
  text-align: right;
  white-space: nowrap;
}

.empty-state {
  color: var(--color-muted);
  padding: 32px 0;
  text-align: center;
}

.retry-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-xs);
  color: var(--color-error);
  margin-bottom: 16px;
}

.retry-banner button {
  background: transparent;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-xs);
  color: var(--color-error);
  padding: 6px 12px;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 8: Create `frontend/.env.example`**

```
VITE_API_BASE_URL=http://localhost:3001
```

- [ ] **Step 9: Verify dev server boots (manual smoke check, no test yet — App.jsx doesn't exist)**

Skip running `npm run dev` here since `App.jsx` doesn't exist yet (Task 4 creates it) — this step only scaffolds config. Proceed to commit.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/vitest.setup.js frontend/index.html frontend/src/main.jsx frontend/src/styles.css frontend/.env.example
git commit -m "chore(frontend): scaffold Vite + React + Vitest project"
```

---

### Task 3: `useMealEvents` hook

**Files:**
- Create: `frontend/src/hooks/useMealEvents.js`
- Create: `frontend/src/hooks/useMealEvents.test.js`

**Interfaces:**
- Consumes: `fetch` (global, mocked in tests), `EventSource` (global, mocked in tests), `import.meta.env.VITE_API_BASE_URL`.
- Produces: `useMealEvents(hours = 48)` → `{meals: Array<Meal>, agentStatus: {status, targetMealId} | null, error: Error | null, retry: () => void}`, where `Meal = {_id, userId, foodId, name, quantity, unit, grams, macros: {calories, protein, carbs, fat}, mealType, loggedAt, createdAt, updatedAt}`. This exact shape is consumed by `MealList`/`MealRow` (Task 5) and `StatusLine` (Task 4).

- [ ] **Step 1: Write the failing test — initial load**

Create `frontend/src/hooks/useMealEvents.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMealEvents } from "./useMealEvents.js";

class MockEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    MockEventSource.instances.push(this);
  }
  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }
  emit(type, event) {
    (this.listeners[type] || []).forEach((cb) => cb(event));
  }
  close() {
    this.closed = true;
  }
}

const meal1 = { _id: "m1", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" };
const meal2 = { _id: "m2", name: "Dal", quantity: 1, unit: "katori", macros: { calories: 200, protein: 10, carbs: 30, fat: 5 }, mealType: "lunch", loggedAt: "2026-09-02T12:01:00.000Z" };

beforeEach(() => {
  MockEventSource.instances = [];
  global.EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [meal2, meal1],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMealEvents", () => {
  it("fetches meals on mount", async () => {
    const { result } = renderHook(() => useMealEvents());

    act(() => {
      MockEventSource.instances[0].emit("open", {});
    });

    await waitFor(() => expect(result.current.meals).toHaveLength(2));
    expect(result.current.meals[0]._id).toBe("m2");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/meals"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useMealEvents.test.js`
Expected: FAIL — `useMealEvents.js` doesn't exist.

- [ ] **Step 3: Write `frontend/src/hooks/useMealEvents.js`**

```javascript
import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function useMealEvents(hours = 48) {
  const [meals, setMeals] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [error, setError] = useState(null);
  const sourceRef = useRef(null);

  const fetchMeals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/meals?hours=${hours}`);
      if (!res.ok) {
        throw new Error(`GET /api/meals failed: ${res.status}`);
      }
      const data = await res.json();
      setMeals(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [hours]);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/events`);
    sourceRef.current = source;

    source.addEventListener("open", () => {
      fetchMeals();
    });

    source.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "meal_logged") {
        setMeals((prev) => (prev.some((m) => m._id === payload.meal._id) ? prev : [payload.meal, ...prev]));
      } else if (payload.type === "meal_updated") {
        setMeals((prev) => prev.map((m) => (m._id === payload.meal._id ? payload.meal : m)));
      } else if (payload.type === "meal_deleted") {
        setMeals((prev) => prev.filter((m) => m._id !== payload.meal._id));
      } else if (payload.type === "agent_status") {
        setAgentStatus({ status: payload.status, targetMealId: payload.targetMealId ?? null });
      }
    });

    return () => {
      source.close();
    };
  }, [fetchMeals]);

  return { meals, agentStatus, error, retry: fetchMeals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/useMealEvents.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing test — SSE delta merges**

Add to `frontend/src/hooks/useMealEvents.test.js`:

```javascript
  it("prepends a meal_logged event without duplicating an already-fetched meal", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    const meal3 = { ...meal1, _id: "m3", name: "Chai" };
    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_logged", meal: meal3 }) });
    });

    expect(result.current.meals).toHaveLength(3);
    expect(result.current.meals[0]._id).toBe("m3");
  });

  it("replaces a meal on meal_updated", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    const updated = { ...meal1, quantity: 5 };
    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_updated", meal: updated }) });
    });

    expect(result.current.meals.find((m) => m._id === "m1").quantity).toBe(5);
  });

  it("removes a meal on meal_deleted", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_deleted", meal: meal1 }) });
    });

    expect(result.current.meals).toHaveLength(1);
    expect(result.current.meals.find((m) => m._id === "m1")).toBeUndefined();
  });

  it("updates agentStatus on agent_status without touching meals", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "awaiting_confirmation", targetMealId: "m1" }),
      });
    });

    expect(result.current.agentStatus).toEqual({ status: "awaiting_confirmation", targetMealId: "m1" });
    expect(result.current.meals).toHaveLength(2);
  });

  it("refetches on a second open event (reconnect)", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [meal1] });
    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
  });

  it("sets error on fetch failure and clears it via retry", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(result.current.error).toBeTruthy());

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [meal1] });
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.meals).toHaveLength(1);
  });
```

- [ ] **Step 6: Run tests to verify they pass (implementation from Step 3 already covers these)**

Run: `cd frontend && npx vitest run src/hooks/useMealEvents.test.js`
Expected: all PASS. If any fail, fix `useMealEvents.js` to match — do not change the tests to match a broken implementation.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useMealEvents.js frontend/src/hooks/useMealEvents.test.js
git commit -m "feat(frontend): add useMealEvents hook for SSE-backed meal state"
```

---

### Task 4: `StatusLine` component

**Files:**
- Create: `frontend/src/components/StatusLine.jsx`
- Create: `frontend/src/components/StatusLine.test.jsx`

**Interfaces:**
- Consumes: `agentStatus: {status: "listening"|"thinking"|"speaking"|"awaiting_confirmation", targetMealId} | null` (from `useMealEvents`, Task 3).
- Produces: `<StatusLine agentStatus={...} />` — no other exports.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/StatusLine.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLine } from "./StatusLine.jsx";

describe("StatusLine", () => {
  it("renders nothing when agentStatus is null", () => {
    const { container } = render(<StatusLine agentStatus={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["listening", "Agent: listening…"],
    ["thinking", "Agent: thinking…"],
    ["speaking", "Agent: speaking…"],
    ["awaiting_confirmation", "Agent: awaiting confirmation…"],
  ])("renders the text for status %s", (status, expected) => {
    render(<StatusLine agentStatus={{ status, targetMealId: null }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/StatusLine.test.jsx`
Expected: FAIL — `StatusLine.jsx` doesn't exist.

- [ ] **Step 3: Write `frontend/src/components/StatusLine.jsx`**

```jsx
const STATUS_TEXT = {
  listening: "Agent: listening…",
  thinking: "Agent: thinking…",
  speaking: "Agent: speaking…",
  awaiting_confirmation: "Agent: awaiting confirmation…",
};

export function StatusLine({ agentStatus }) {
  if (!agentStatus) {
    return null;
  }

  const text = STATUS_TEXT[agentStatus.status] ?? `Agent: ${agentStatus.status}`;

  return <p className="status-line">{text}</p>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/StatusLine.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatusLine.jsx frontend/src/components/StatusLine.test.jsx
git commit -m "feat(frontend): add StatusLine component"
```

---

### Task 5: `MealRow`, `EmptyState`, `MealList` components

**Files:**
- Create: `frontend/src/components/MealRow.jsx`
- Create: `frontend/src/components/MealRow.test.jsx`
- Create: `frontend/src/components/EmptyState.jsx`
- Create: `frontend/src/components/MealList.jsx`
- Create: `frontend/src/components/MealList.test.jsx`

**Interfaces:**
- Consumes: `Meal` shape and `agentStatus` shape from Task 3.
- Produces: `<MealRow meal={...} highlighted={boolean} />`, `<EmptyState />`, `<MealList meals={[...]} agentStatus={...} error={Error|null} onRetry={() => void} />` — `MealList` is what `App` (Task 6) renders.

- [ ] **Step 1: Write the failing test for `MealRow`**

Create `frontend/src/components/MealRow.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealRow } from "./MealRow.jsx";

const meal = {
  _id: "m1",
  name: "Roti",
  quantity: 2,
  unit: "piece",
  macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 },
  mealType: "lunch",
  loggedAt: "2026-09-02T12:00:00.000Z",
};

describe("MealRow", () => {
  it("renders name, quantity+unit, mealType, and macros", () => {
    render(<MealRow meal={meal} highlighted={false} />);
    expect(screen.getByText("Roti")).toBeInTheDocument();
    expect(screen.getByText(/2 piece/)).toBeInTheDocument();
    expect(screen.getByText(/lunch/)).toBeInTheDocument();
    expect(screen.getByText(/594 kcal/)).toBeInTheDocument();
  });

  it("applies the highlighted class when highlighted is true", () => {
    const { container } = render(<MealRow meal={meal} highlighted={true} />);
    expect(container.firstChild).toHaveClass("highlighted");
  });

  it("does not apply the highlighted class when highlighted is false", () => {
    const { container } = render(<MealRow meal={meal} highlighted={false} />);
    expect(container.firstChild).not.toHaveClass("highlighted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/MealRow.test.jsx`
Expected: FAIL — `MealRow.jsx` doesn't exist.

- [ ] **Step 3: Write `frontend/src/components/MealRow.jsx`**

```jsx
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MealRow({ meal, highlighted }) {
  const { name, quantity, unit, macros, mealType, loggedAt } = meal;

  return (
    <div className={highlighted ? "meal-row highlighted" : "meal-row"}>
      <div className="meal-row-main">
        <span className="meal-row-name">{name}</span>
        <span className="meal-row-meta">
          {quantity} {unit} · {mealType} · {formatTime(loggedAt)}
        </span>
      </div>
      <div className="meal-row-macros">
        {macros.calories} kcal · {macros.protein}g P · {macros.carbs}g C · {macros.fat}g F
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/MealRow.test.jsx`
Expected: PASS

- [ ] **Step 5: Write `frontend/src/components/EmptyState.jsx` (no test — trivial static markup)**

```jsx
export function EmptyState() {
  return <p className="empty-state">No meals logged yet — try the voice agent.</p>;
}
```

- [ ] **Step 6: Write the failing test for `MealList`**

Create `frontend/src/components/MealList.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealList } from "./MealList.jsx";

const mealA = { _id: "a", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" };
const mealB = { _id: "b", name: "Dal", quantity: 1, unit: "katori", macros: { calories: 200, protein: 10, carbs: 30, fat: 5 }, mealType: "lunch", loggedAt: "2026-09-02T12:05:00.000Z" };

describe("MealList", () => {
  it("renders meals in the order given (caller controls newest-first)", () => {
    render(<MealList meals={[mealB, mealA]} agentStatus={null} error={null} onRetry={() => {}} />);
    const names = screen.getAllByText(/Roti|Dal/).map((el) => el.textContent);
    expect(names).toEqual(["Dal", "Roti"]);
  });

  it("renders EmptyState when meals is empty", () => {
    render(<MealList meals={[]} agentStatus={null} error={null} onRetry={() => {}} />);
    expect(screen.getByText(/No meals logged yet/)).toBeInTheDocument();
  });

  it("renders a retry banner when error is set, and calls onRetry on click", () => {
    const onRetry = vi.fn();
    render(<MealList meals={[]} agentStatus={null} error={new Error("boom")} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /retry/i });
    button.click();
    expect(onRetry).toHaveBeenCalled();
  });

  it("highlights the meal matching targetMealId during awaiting_confirmation", () => {
    const { container } = render(
      <MealList
        meals={[mealA, mealB]}
        agentStatus={{ status: "awaiting_confirmation", targetMealId: "a" }}
        error={null}
        onRetry={() => {}}
      />
    );
    const rows = container.querySelectorAll(".meal-row");
    expect(rows[0]).toHaveClass("highlighted");
    expect(rows[1]).not.toHaveClass("highlighted");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/MealList.test.jsx`
Expected: FAIL — `MealList.jsx` doesn't exist.

- [ ] **Step 8: Write `frontend/src/components/MealList.jsx`**

```jsx
import { MealRow } from "./MealRow.jsx";
import { EmptyState } from "./EmptyState.jsx";

export function MealList({ meals, agentStatus, error, onRetry }) {
  return (
    <div>
      {error && (
        <div className="retry-banner">
          <span>Couldn't load meals — {error.message}</span>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {meals.length === 0 ? (
        <EmptyState />
      ) : (
        meals.map((meal) => (
          <MealRow
            key={meal._id}
            meal={meal}
            highlighted={agentStatus?.status === "awaiting_confirmation" && agentStatus?.targetMealId === meal._id}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/MealList.test.jsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/MealRow.jsx frontend/src/components/MealRow.test.jsx frontend/src/components/EmptyState.jsx frontend/src/components/MealList.jsx frontend/src/components/MealList.test.jsx
git commit -m "feat(frontend): add MealRow, EmptyState, MealList components"
```

---

### Task 6: `App` component wiring it all together

**Files:**
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/App.test.jsx`

**Interfaces:**
- Consumes: `useMealEvents` (Task 3), `StatusLine` (Task 4), `MealList` (Task 5).
- Produces: `<App />` — the component rendered by `main.jsx` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/App.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import App from "./App.jsx";

class MockEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    MockEventSource.instances.push(this);
  }
  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }
  emit(type, event) {
    (this.listeners[type] || []).forEach((cb) => cb(event));
  }
  close() {}
}

beforeEach(() => {
  MockEventSource.instances = [];
  global.EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { _id: "a", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" },
    ],
  });
});

describe("App", () => {
  it("renders the title and loaded meals", async () => {
    render(<App />);
    expect(screen.getByText(/Meal Log/i)).toBeInTheDocument();

    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(screen.getByText("Roti")).toBeInTheDocument());
  });

  it("renders the status line once an agent_status event arrives", async () => {
    render(<App />);
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(screen.getByText("Roti")).toBeInTheDocument());

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "listening" }),
      });
    });

    expect(screen.getByText("Agent: listening…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: FAIL — `App.jsx` doesn't exist.

- [ ] **Step 3: Write `frontend/src/App.jsx`**

```jsx
import { useMealEvents } from "./hooks/useMealEvents.js";
import { StatusLine } from "./components/StatusLine.jsx";
import { MealList } from "./components/MealList.jsx";

export default function App() {
  const { meals, agentStatus, error, retry } = useMealEvents();

  return (
    <div className="app">
      <h1 className="app-title">Meal Log</h1>
      <StatusLine agentStatus={agentStatus} />
      <MealList meals={meals} agentStatus={agentStatus} error={error} onRetry={retry} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(frontend): wire App with useMealEvents, StatusLine, MealList"
```

---

### Task 7: Manual end-to-end smoke check + README

**Files:**
- Create: `frontend/README.md`

**Interfaces:**
- None — this task produces documentation and a manual verification pass, no new code interfaces.

- [ ] **Step 1: Write `frontend/README.md`**

```markdown
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

\`\`\`bash
npm run dev
\`\`\`

Opens on `http://localhost:5173` by default.

## Test

\`\`\`bash
npm test
\`\`\`

## What's here

- `src/hooks/useMealEvents.js` — owns the SSE connection + fetch-on-connect/
  reconnect logic.
- `src/components/` — `StatusLine` (plain-text agent status),
  `MealList`/`MealRow`/`EmptyState` (read-only meal display).
- No routing, no state library — one page, one hook.
```

- [ ] **Step 2: Start the backend and frontend, verify manually**

```bash
# terminal 1
cd backend && npm start
# terminal 2
cd frontend && cp .env.example .env && npm run dev
```

Open `http://localhost:5173` in a browser. Confirm:
- Page loads with title "Meal Log" and no console CORS errors.
- If meals already exist in Mongo for `DEFAULT_USER_ID`, they render newest-first with correct macros.
- If none exist, "No meals logged yet — try the voice agent." renders.
- `POST /api/agent-status` with `curl -X POST http://localhost:3001/api/agent-status -H "Content-Type: application/json" -d '{"status":"listening"}'` makes the status line appear within a couple seconds without a page refresh.
- Logging a meal via `curl -X POST http://localhost:3001/api/meals -H "Content-Type: application/json" -d '{"food":"roti","quantity":2,"unit":"piece","mealType":"lunch"}'` makes it appear at the top of the list without a page refresh.
- Kill and restart the backend while the frontend tab is open — confirm the meal list still reflects reality within a few seconds after the backend comes back (reconnect-triggered refetch).

- [ ] **Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs(frontend): add setup/run/test README"
```

---

## Self-Review Notes

- **Spec coverage:** StatusLine (spec §Components) → Task 4. MealList/MealRow/EmptyState → Task 5. useMealEvents merge/reconnect/error logic → Task 3. CORS → Task 1. Styling tokens → Task 2 (styles.css) + Task 4/5 (className usage). Testing plan → one task per component/hook, matches spec's test list exactly. Manual e2e check → Task 7.
- **Type consistency:** `Meal` shape defined once in Global Constraints, reused verbatim in Task 3/4/5/6 test fixtures. `agentStatus` shape (`{status, targetMealId}`) consistent across Task 3 hook, Task 4 `StatusLine`, Task 5 `MealList` highlight logic.
- **No placeholders:** every step has literal code, no "add tests for the above" or "similar to Task N" shortcuts.
