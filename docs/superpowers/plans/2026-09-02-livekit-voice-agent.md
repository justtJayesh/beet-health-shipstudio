# LiveKit Voice Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node.js LiveKit voice agent that logs/edits/deletes meals via natural speech against the existing backend REST API, plus the two small backend additions it depends on.

**Architecture:** Two small additions to the existing Express backend (an `agent-status` broadcast route, idempotency on `PATCH /api/meals/:id`), then a new `agent/` Node package containing pure/testable logic (`quantityGuard.js`, `backendClient.js`) and thin LiveKit SDK wiring (`agent.js`, `main.js`) that calls that logic from `@livekit/agents` tool definitions.

**Tech Stack:** Node.js (ESM), Express (backend, already in place), `@livekit/agents` v1.7.x + `@livekit/rtc-node` + `zod` (agent), Vitest (both).

**Spec:** `docs/superpowers/specs/2026-09-02-livekit-voice-agent-design.md`

## Global Constraints

- Backend base URL for the agent: `http://127.0.0.1:3001` by default, overridable via `BACKEND_URL` env var (per spec's `.env.example` list).
- Backend error/response shapes are fixed by the existing implementation — do not change them, only add to them:
  - `POST /api/meals` → `201 {meal}` fresh, `200 {meal, deduped: true}` on idempotency-key repeat, `400 {error, message?}`, `422 {error: "no_match"|"ambiguous", candidates?}` or `422 {error: "invalid_unit", message}`.
  - `PATCH /api/meals/:id` → `200 {meal}` (and, after Task 2, `200 {meal, deduped: true}`), `404 {error: "meal_not_found"}`, `400`/`422` same shapes as POST.
  - `DELETE /api/meals/:id` → `200 {meal}`, `404 {error: "meal_not_found"}`.
  - `GET /api/meals?hours=<N>` → `200 {meals: [...]}` newest first.
- `DEFAULT_USER_ID` (`backend/src/constants.js`) is the single fixed user — no auth, nothing in this plan touches that.
- Every `log_meal`/`edit_meal` call from the agent carries a generated `idempotencyKey` (Decision #34) — never omit it.
- `delete_meal` is only ever called by the agent after an explicit confirmed spoken turn — enforced in the system prompt, not in code (there is no server-side "are you sure" step to build).
- Agent status values are exactly: `"listening" | "thinking" | "speaking" | "awaiting_confirmation"`, with optional `targetMealId` (string) present only for `"awaiting_confirmation"`.

---

### Task 1: `POST /api/agent-status` backend route

**Files:**
- Modify: `backend/src/server.js` (mount new route)
- Create: `backend/src/routes/agentStatus.js`
- Test: `backend/test/routes/agentStatus.test.js`

**Interfaces:**
- Consumes: `broadcast` from `backend/src/sse/broadcast.js` (existing, exported as `broadcast(event)` — takes any JSON-serializable object).
- Produces: `createAgentStatusRouter()` — an Express router factory (no dependencies, unlike `createFoodsRouter`/`createMealsRouter` which take `{ index }`) — mounted at `/api/agent-status` in `server.js`. Later tasks (the agent's `backendClient.js`) rely on this route accepting `POST { status, targetMealId? }` and responding `204`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/routes/agentStatus.test.js`:

```javascript
// backend/test/routes/agentStatus.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/server.js";
import { registerClient, _resetForTests } from "../../src/sse/broadcast.js";
import { EventEmitter } from "node:events";

function makeFakeResponse() {
  const res = new EventEmitter();
  res.written = [];
  res.write = (chunk) => res.written.push(chunk);
  return res;
}

let server;
let baseUrl;

beforeEach(async () => {
  _resetForTests();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function postStatus(body) {
  const res = await fetch(`${baseUrl}/api/agent-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

describe("POST /api/agent-status", () => {
  it("broadcasts a valid status to every SSE client and returns 204", async () => {
    const fakeRes = makeFakeResponse();
    registerClient(fakeRes);

    const { status } = await postStatus({ status: "thinking" });

    expect(status).toBe(204);
    expect(fakeRes.written).toHaveLength(1);
    expect(fakeRes.written[0]).toBe('data: {"type":"agent_status","status":"thinking"}\n\n');
  });

  it("includes targetMealId when present", async () => {
    const fakeRes = makeFakeResponse();
    registerClient(fakeRes);

    await postStatus({ status: "awaiting_confirmation", targetMealId: "abc123" });

    expect(fakeRes.written[0]).toBe(
      'data: {"type":"agent_status","status":"awaiting_confirmation","targetMealId":"abc123"}\n\n'
    );
  });

  it("rejects an invalid status with 400", async () => {
    const { status, body } = await postStatus({ status: "sleeping" });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_status");
  });

  it("rejects a missing status with 400", async () => {
    const { status, body } = await postStatus({});
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_status");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes/agentStatus.test.js`
Expected: FAIL — `/api/agent-status` doesn't exist yet (404s, or import error since the route file doesn't exist).

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/routes/agentStatus.js`:

```javascript
// backend/src/routes/agentStatus.js
import express from "express";
import { broadcast } from "../sse/broadcast.js";

const VALID_STATUSES = ["listening", "thinking", "speaking", "awaiting_confirmation"];

export function createAgentStatusRouter() {
  const router = express.Router();

  router.post("/", (req, res) => {
    const { status, targetMealId } = req.body ?? {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "invalid_status", message: `status must be one of ${VALID_STATUSES.join(", ")}` });
    }

    const event = { type: "agent_status", status };
    if (targetMealId != null) {
      event.targetMealId = targetMealId;
    }
    broadcast(event);
    return res.status(204).end();
  });

  return router;
}
```

Modify `backend/src/server.js` — add the import and mount alongside the existing routers:

```javascript
import { createAgentStatusRouter } from "./routes/agentStatus.js";
```

and, right after `app.use("/api/meals", createMealsRouter({ index }));`:

```javascript
  app.use("/api/agent-status", createAgentStatusRouter());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes/agentStatus.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && npm test`
Expected: PASS (all existing + 4 new tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/agentStatus.js backend/src/server.js backend/test/routes/agentStatus.test.js
git commit -m "feat(backend): add POST /api/agent-status route broadcasting over SSE"
```

---

### Task 2: Idempotency on `PATCH /api/meals/:id`

**Files:**
- Modify: `backend/src/routes/meals.js:88-116` (the `router.patch("/:id", ...)` handler)
- Test: `backend/test/routes/meals.test.js` (add cases; existing file, existing patterns)

**Interfaces:**
- Consumes: `Meal` model (existing, already has `idempotencyKey` field + partial unique index on `{userId, idempotencyKey}` per `backend/src/models/Meal.js`), `DEFAULT_USER_ID`.
- Produces: `PATCH /api/meals/:id` now accepts an optional `idempotencyKey` in the body. No new exports — behavior-only change to an existing route.

- [ ] **Step 1: Write the failing tests**

Read `backend/test/routes/meals.test.js` first to see the exact `postMeal`/helper patterns already in the file (there's a `postMeal` helper near the top — add a `patchMeal` helper the same way if one doesn't already exist). Add this `describe` block to the file, inside the existing test suite (same file, same `beforeAll`/`baseUrl` setup):

```javascript
async function patchMeal(id, body) {
  const res = await fetch(`${baseUrl}/api/meals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("PATCH /api/meals/:id idempotency", () => {
  it("returns deduped:true on a repeated idempotencyKey without double-applying the edit", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const mealId = created.meal._id;

    const first = await patchMeal(mealId, { quantity: 3, idempotencyKey: "edit-key-1" });
    expect(first.status).toBe(200);
    expect(first.body.meal.quantity).toBe(3);

    const second = await patchMeal(mealId, { quantity: 3, idempotencyKey: "edit-key-1" });
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);
    expect(second.body.meal.quantity).toBe(3);
  });

  it("applies a normal edit with no idempotencyKey exactly as before", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const { status, body } = await patchMeal(created.meal._id, { quantity: 5 });
    expect(status).toBe(200);
    expect(body.meal.quantity).toBe(5);
    expect(body.deduped).toBeUndefined();
  });

  it("treats different idempotencyKeys on the same meal as independent edits", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const mealId = created.meal._id;

    await patchMeal(mealId, { quantity: 2, idempotencyKey: "edit-key-a" });
    const second = await patchMeal(mealId, { quantity: 4, idempotencyKey: "edit-key-b" });

    expect(second.status).toBe(200);
    expect(second.body.deduped).toBeUndefined();
    expect(second.body.meal.quantity).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes/meals.test.js -t "idempotency"`
Expected: FAIL — the second call with the same key re-applies the edit instead of returning `deduped: true` (no dedup logic exists yet in PATCH).

- [ ] **Step 3: Write minimal implementation**

Modify `backend/src/routes/meals.js` — the existing `router.patch("/:id", ...)` handler (currently lines ~88-116) becomes:

```javascript
  router.patch("/:id", async (req, res, next) => {
    try {
      const meal = await Meal.findOne({ _id: req.params.id, userId: DEFAULT_USER_ID });
      if (!meal) {
        return res.status(404).json({ error: "meal_not_found" });
      }

      const { food, quantity, unit, mealType, loggedAt, idempotencyKey } = req.body ?? {};

      if (idempotencyKey && meal.idempotencyKey === idempotencyKey) {
        return res.status(200).json({ meal, deduped: true });
      }

      if (quantity != null && !Number.isFinite(Number(quantity))) {
        return res.status(400).json({ error: "invalid_quantity", message: "quantity must be a finite number" });
      }
      const isFieldEdit = food != null || quantity != null || unit != null;

      if (isFieldEdit) {
        let fields;
        try {
          fields = resolveMealFields(
            {
              foodQuery: food ?? meal.name,
              quantity: quantity ?? meal.quantity,
              unit: unit ?? meal.unit,
            },
            index
          );
        } catch (err) {
          return respondResolutionError(res, err);
        }
        Object.assign(meal, fields);
      }

      if (mealType) meal.mealType = mealType;
      if (loggedAt) meal.loggedAt = new Date(loggedAt);
      if (idempotencyKey) meal.idempotencyKey = idempotencyKey;

      await meal.save();
      broadcast({ type: "meal_updated", meal });
      return res.json({ meal });
    } catch (err) {
      next(err);
    }
  });
```

This mirrors POST's pattern but scoped to "was this exact key already applied to *this* meal" (a simple field comparison) rather than a separate lookup — `edit_meal` always targets one specific `meal_id`, so there's no cross-document ambiguity POST has to handle via a query. No schema/index change needed: the existing `idempotencyKey` field and its partial unique index already accept being set on an update.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes/meals.test.js`
Expected: PASS (all PATCH tests, including the 3 new ones)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 6: Update backend README's PATCH docs**

Modify `backend/README.md` — in the `PATCH /api/meals/:id` bullet, add a sentence: "Accepts an optional `idempotencyKey`; repeating the same key on the same meal returns `200 {meal, deduped: true}` instead of re-applying the edit."

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/meals.js backend/test/routes/meals.test.js backend/README.md
git commit -m "fix(backend): add idempotency handling to PATCH /api/meals/:id"
```

---

### Task 3: `agent/` package scaffold + `quantityGuard.js`

**Files:**
- Create: `agent/package.json`
- Create: `agent/.env.example`
- Create: `agent/.gitignore`
- Create: `agent/src/quantityGuard.js`
- Test: `agent/test/quantityGuard.test.js`

**Interfaces:**
- Consumes: repo-root `foods.json` (existing file, shape: `{_meta, foods: [{id, name, aliases, macrosPer100g, units: [{name, grams}]}]}` — same file the backend reads).
- Produces: `loadFoodsById(foodsJsonPath?)` → `Map<string, food>` keyed by `food.id`. `isImplausible({ foodId, quantity, unit, foodsById })` → `boolean`. Later tasks (`agent.js`) call `isImplausible` before invoking `log_meal`/`edit_meal`.

- [ ] **Step 1: Create the package scaffold**

Create `agent/package.json`:

```json
{
  "name": "beet-voice-agent",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "node src/main.js dev",
    "start": "node src/main.js start",
    "test": "vitest run"
  },
  "dependencies": {
    "@livekit/agents": "^1.7.1",
    "@livekit/rtc-node": "^0.13.34",
    "dotenv": "^16.4.5",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "vitest": "^2.0.5"
  }
}
```

Create `agent/.env.example`:

```
# Copy to .env and fill in real values before running the agent.
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
# Base URL of the running backend (Next Steps #1) — defaults work for local dev.
BACKEND_URL=http://127.0.0.1:3001
```

Create `agent/.gitignore`:

```
node_modules/
.env
```

- [ ] **Step 2: Install dependencies**

Run: `cd agent && npm install`
Expected: installs cleanly, creates `agent/package-lock.json` and `agent/node_modules/`.

- [ ] **Step 3: Write the failing test**

Create `agent/test/quantityGuard.test.js`:

```javascript
// agent/test/quantityGuard.test.js
import { describe, it, expect } from "vitest";
import { isImplausible, loadFoodsById } from "../src/quantityGuard.js";

const sampleFoods = new Map([
  ["roti", { id: "roti", units: [{ name: "piece", grams: 40 }, { name: "gram", grams: 1 }] }],
  ["plain_rice", { id: "plain_rice", units: [{ name: "katori", grams: 150 }, { name: "plate", grams: 300 }, { name: "gram", grams: 1 }] }],
]);

describe("isImplausible", () => {
  it("is false for a normal quantity", () => {
    expect(isImplausible({ foodId: "roti", quantity: 3, unit: "piece", foodsById: sampleFoods })).toBe(false);
  });

  it("is false exactly at the threshold (5x the food's largest unit)", () => {
    // largest unit for roti is "piece" @ 40g -> threshold = 5 * 40 = 200g -> 5 pieces
    expect(isImplausible({ foodId: "roti", quantity: 5, unit: "piece", foodsById: sampleFoods })).toBe(false);
  });

  it("is true just over the threshold", () => {
    expect(isImplausible({ foodId: "roti", quantity: 6, unit: "piece", foodsById: sampleFoods })).toBe(true);
  });

  it("is true for an implausible gram-unit quantity (ASR twenty-for-two style error)", () => {
    // threshold in grams = 5 * 40 = 200g
    expect(isImplausible({ foodId: "roti", quantity: 250, unit: "gram", foodsById: sampleFoods })).toBe(true);
  });

  it("uses each food's own largest unit, not a shared constant", () => {
    // plain_rice's largest unit is "plate" @ 300g -> threshold = 1500g -> 5 plates is fine, 6 is not
    expect(isImplausible({ foodId: "plain_rice", quantity: 5, unit: "plate", foodsById: sampleFoods })).toBe(false);
    expect(isImplausible({ foodId: "plain_rice", quantity: 6, unit: "plate", foodsById: sampleFoods })).toBe(true);
  });

  it("throws if the food or unit isn't found (caller's responsibility to resolve first)", () => {
    expect(() => isImplausible({ foodId: "unknown_food", quantity: 1, unit: "piece", foodsById: sampleFoods })).toThrow();
    expect(() => isImplausible({ foodId: "roti", quantity: 1, unit: "bucket", foodsById: sampleFoods })).toThrow();
  });
});

describe("loadFoodsById", () => {
  it("loads the real repo-root foods.json into a Map keyed by id", () => {
    const foodsById = loadFoodsById();
    expect(foodsById.get("roti").name).toBe("Roti");
    expect(foodsById.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd agent && npx vitest run test/quantityGuard.test.js`
Expected: FAIL — `../src/quantityGuard.js` doesn't exist yet.

- [ ] **Step 5: Write minimal implementation**

Create `agent/src/quantityGuard.js`:

```javascript
// agent/src/quantityGuard.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_FOODS_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../foods.json"
);

// Above this multiple of a food's own largest listed unit, the quantity is
// treated as an ASR misparse (e.g. "twenty" heard for "two") rather than a
// legitimate large serving, and the caller should ask the user to confirm
// before logging. Per-food (via each food's units), not a flat constant,
// since a "piece" of one food and a "plate" of another mean very different
// gram amounts. See Decision #37 in the design doc.
const THRESHOLD_MULTIPLIER = 5;

export function loadFoodsById(foodsJsonPath = DEFAULT_FOODS_JSON_PATH) {
  const raw = JSON.parse(readFileSync(foodsJsonPath, "utf-8"));
  return new Map(raw.foods.map((food) => [food.id, food]));
}

function unitGrams(food, unit) {
  const match = food.units.find((u) => u.name === unit);
  if (!match) {
    throw new Error(`Unknown unit "${unit}" for food "${food.id}"`);
  }
  return match.grams;
}

function largestUnitGrams(food) {
  return Math.max(...food.units.map((u) => u.grams));
}

export function isImplausible({ foodId, quantity, unit, foodsById }) {
  const food = foodsById.get(foodId);
  if (!food) {
    throw new Error(`Unknown food id "${foodId}"`);
  }
  const grams = quantity * unitGrams(food, unit);
  const threshold = THRESHOLD_MULTIPLIER * largestUnitGrams(food);
  return grams > threshold;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd agent && npx vitest run test/quantityGuard.test.js`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add agent/package.json agent/.env.example agent/.gitignore agent/src/quantityGuard.js agent/test/quantityGuard.test.js
git commit -m "feat(agent): scaffold agent package, add quantity sanity-bound guard"
```

*(Note: `agent/package-lock.json` and `agent/node_modules/` are produced by `npm install` in Step 2 — commit the lockfile alongside this task's files; `node_modules/` is gitignored.)*

---

### Task 4: `backendClient.js`

**Files:**
- Create: `agent/src/backendClient.js`
- Test: `agent/test/backendClient.test.js`

**Interfaces:**
- Consumes: `fetch` (global, Node 18+), `crypto.randomUUID()` (global). `BACKEND_URL` env var, default `"http://127.0.0.1:3001"`.
- Produces: `createBackendClient({ baseUrl? })` returning `{ logMeal, editMeal, deleteMeal, listMeals, postAgentStatus }`. Task 5 (`agent.js`) imports and uses this factory directly.
  - `logMeal({ food, quantity, unit, mealType? })` → `Promise<{status: number, body: object}>`. Generates and attaches `idempotencyKey` internally.
  - `editMeal(mealId, { food?, quantity?, unit?, mealType?, loggedAt? })` → same shape, also attaches `idempotencyKey`.
  - `deleteMeal(mealId)` → `Promise<{status: number, body: object}>`.
  - `listMeals({ hours? } = {})` → `Promise<{status: number, body: object}>`.
  - `postAgentStatus({ status, targetMealId? })` → `Promise<void>` (route returns 204, nothing to parse).

- [ ] **Step 1: Write the failing test**

Create `agent/test/backendClient.test.js`:

```javascript
// agent/test/backendClient.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBackendClient } from "../src/backendClient.js";

function jsonResponse(status, body) {
  return { status, json: () => Promise.resolve(body) };
}

describe("createBackendClient", () => {
  let fetchMock;
  let client;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = createBackendClient({ baseUrl: "http://test-backend" });
  });

  it("logMeal POSTs to /api/meals with a generated UUID idempotencyKey", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { meal: { _id: "m1" } }));

    const result = await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals");
    expect(options.method).toBe("POST");
    const sentBody = JSON.parse(options.body);
    expect(sentBody.food).toBe("roti");
    expect(sentBody.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ status: 201, body: { meal: { _id: "m1" } } });
  });

  it("logMeal passes through a deduped response distinctly from a fresh one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1" }, deduped: true }));
    const result = await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });
    expect(result.status).toBe(200);
    expect(result.body.deduped).toBe(true);
  });

  it("logMeal passes through a 422 ambiguous outcome without throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { error: "ambiguous", candidates: [{ id: "dal_tadka" }] }));
    const result = await client.logMeal({ food: "dal", quantity: 1, unit: "katori" });
    expect(result.status).toBe(422);
    expect(result.body.error).toBe("ambiguous");
  });

  it("editMeal PATCHes /api/meals/:id with a generated idempotencyKey", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1", quantity: 3 } }));
    const result = await client.editMeal("m1", { quantity: 3 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals/m1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.body.meal.quantity).toBe(3);
  });

  it("deleteMeal DELETEs /api/meals/:id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1" } }));
    const result = await client.deleteMeal("m1");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals/m1");
    expect(options.method).toBe("DELETE");
    expect(result.status).toBe(200);
  });

  it("deleteMeal passes through a 404 without throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "meal_not_found" }));
    const result = await client.deleteMeal("missing");
    expect(result.status).toBe(404);
  });

  it("listMeals GETs /api/meals with an hours query param when given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meals: [] }));
    await client.listMeals({ hours: 24 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals?hours=24");
  });

  it("listMeals GETs /api/meals with no query param when hours is omitted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meals: [] }));
    await client.listMeals();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals");
  });

  it("postAgentStatus POSTs to /api/agent-status and resolves without a body", async () => {
    fetchMock.mockResolvedValue({ status: 204 });
    await client.postAgentStatus({ status: "thinking" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/agent-status");
    expect(JSON.parse(options.body)).toEqual({ status: "thinking" });
  });

  it("postAgentStatus includes targetMealId when given", async () => {
    fetchMock.mockResolvedValue({ status: 204 });
    await client.postAgentStatus({ status: "awaiting_confirmation", targetMealId: "m1" });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ status: "awaiting_confirmation", targetMealId: "m1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && npx vitest run test/backendClient.test.js`
Expected: FAIL — `../src/backendClient.js` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `agent/src/backendClient.js`:

```javascript
// agent/src/backendClient.js
import { randomUUID } from "node:crypto";

export function createBackendClient({ baseUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001" } = {}) {
  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 204) {
      return { status: 204, body: null };
    }
    return { status: res.status, body: await res.json() };
  }

  return {
    logMeal({ food, quantity, unit, mealType }) {
      return request("/api/meals", {
        method: "POST",
        body: JSON.stringify({ food, quantity, unit, mealType, idempotencyKey: randomUUID() }),
      });
    },

    editMeal(mealId, { food, quantity, unit, mealType, loggedAt } = {}) {
      return request(`/api/meals/${mealId}`, {
        method: "PATCH",
        body: JSON.stringify({ food, quantity, unit, mealType, loggedAt, idempotencyKey: randomUUID() }),
      });
    },

    deleteMeal(mealId) {
      return request(`/api/meals/${mealId}`, { method: "DELETE" });
    },

    listMeals({ hours } = {}) {
      const query = hours != null ? `?hours=${hours}` : "";
      return request(`/api/meals${query}`, { method: "GET" });
    },

    async postAgentStatus({ status, targetMealId }) {
      const payload = targetMealId != null ? { status, targetMealId } : { status };
      await request("/api/agent-status", { method: "POST", body: JSON.stringify(payload) });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && npx vitest run test/backendClient.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add agent/src/backendClient.js agent/test/backendClient.test.js
git commit -m "feat(agent): add backendClient with per-call idempotency keys"
```

---

### Task 5: `agent.js` — system prompt and tool definitions

**Files:**
- Create: `agent/src/agent.js`

**Interfaces:**
- Consumes: `createBackendClient` (Task 4), `isImplausible`/`loadFoodsById` (Task 3), `tool` and `Agent` from `@livekit/agents`, `z` from `zod`.
- Produces: `buildAgent({ backendClient, foodsById })` → an `@livekit/agents` `Agent` instance with `instructions` and `tools` set. Task 6 (`main.js`) calls this inside the job entrypoint.

No unit test in this task — the deliverable is an `Agent` instance whose shape is dictated entirely by the `@livekit/agents` SDK types (`tool()`, `Agent` constructor); its correctness is exercised through LiveKit's text/playground mode (manual, per the spec's Testing section), not Vitest. The tool `execute` functions themselves are just thin calls into the already-tested `backendClient`/`quantityGuard` — there is no new branchy logic here worth a mocked-SDK test.

- [ ] **Step 1: Write `agent.js`**

Create `agent/src/agent.js`:

```javascript
// agent/src/agent.js
import { Agent, tool } from "@livekit/agents";
import { z } from "zod";
import { isImplausible } from "./quantityGuard.js";

function foodNamesList(foodsById) {
  return Array.from(foodsById.values())
    .map((food) => food.name)
    .join(", ");
}

export function buildAgent({ backendClient, foodsById }) {
  const logMealTool = tool({
    name: "log_meal",
    description:
      "Log one food item the user says they ate. Call this once per distinct food item — " +
      "if the user mentions multiple foods in one sentence, call this tool separately for each one.",
    parameters: z.object({
      food: z.string().describe("The food name or alias as the user said it"),
      quantity: z.number().describe("How many units of the food"),
      unit: z.string().describe("The household unit, e.g. piece, katori, plate, gram"),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    }),
    execute: async ({ food, quantity, unit, mealType }) => {
      const result = await backendClient.logMeal({ food, quantity, unit, mealType });
      return result.body;
    },
  });

  const editMealTool = tool({
    name: "edit_meal",
    description: "Edit a previously logged meal, identified by its meal_id (use find_recent_meals first if you don't already have it).",
    parameters: z.object({
      meal_id: z.string(),
      food: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
      loggedAt: z.string().optional().describe("ISO8601 timestamp"),
    }),
    execute: async ({ meal_id, food, quantity, unit, mealType, loggedAt }) => {
      const result = await backendClient.editMeal(meal_id, { food, quantity, unit, mealType, loggedAt });
      return result.body;
    },
  });

  const deleteMealTool = tool({
    name: "delete_meal",
    description:
      "Permanently delete a logged meal, identified by its meal_id. " +
      "Only call this after the user has explicitly confirmed the deletion in the current turn — " +
      "never call it on the first mention of wanting to delete something.",
    parameters: z.object({ meal_id: z.string() }),
    execute: async ({ meal_id }) => {
      const result = await backendClient.deleteMeal(meal_id);
      return result.body;
    },
  });

  const findRecentMealsTool = tool({
    name: "find_recent_meals",
    description: "List the user's recently logged meals, most recent first. Use this to find a meal_id before editing or deleting.",
    parameters: z.object({
      hours: z.number().optional().describe("Only return meals logged within this many hours. Omit to list everything."),
    }),
    execute: async ({ hours }) => {
      const result = await backendClient.listMeals({ hours });
      return result.body;
    },
  });

  const checkQuantityTool = tool({
    name: "check_quantity_plausible",
    description:
      "Before calling log_meal or edit_meal, call this with the resolved food id, quantity, and unit " +
      "to check whether the quantity looks like a misheard/implausible amount that needs the user's " +
      "confirmation before logging. If it returns implausible=true, ask the user to confirm the amount " +
      "out loud before calling log_meal/edit_meal.",
    parameters: z.object({
      food_id: z.string().describe("The resolved food id, e.g. \"roti\" — not the spoken phrase"),
      quantity: z.number(),
      unit: z.string(),
    }),
    execute: async ({ food_id, quantity, unit }) => {
      try {
        const implausible = isImplausible({ foodId: food_id, quantity, unit, foodsById });
        return { implausible };
      } catch {
        // Unknown food/unit at this stage just means "let log_meal's own
        // resolution handle it" — not this tool's job to validate existence.
        return { implausible: false };
      }
    },
  });

  return new Agent({
    instructions:
      "You are Beet, a voice assistant that logs meals for one user. You can ONLY log foods from " +
      `this closed list: ${foodNamesList(foodsById)}. If the user mentions a food not on this list, ` +
      "tell them it's not in the food list rather than guessing or logging something close. " +
      "For each distinct food item the user mentions, call log_meal once. " +
      "Before every log_meal or edit_meal call, first call check_quantity_plausible with the resolved " +
      "food id — if it says implausible, ask the user to confirm the quantity out loud and only proceed " +
      "after they confirm. " +
      "Before calling delete_meal, always ask the user to confirm which meal and get an explicit yes " +
      "in the same conversation — never delete on the first request. " +
      "Keep responses short and conversational, since this is a voice interface.",
    tools: {
      log_meal: logMealTool,
      edit_meal: editMealTool,
      delete_meal: deleteMealTool,
      find_recent_meals: findRecentMealsTool,
      check_quantity_plausible: checkQuantityTool,
    },
  });
}
```

- [ ] **Step 2: Sanity-check the module loads**

Run: `cd agent && node -e "
import('./src/agent.js').then(async (m) => {
  const { createBackendClient } = await import('./src/backendClient.js');
  const { loadFoodsById } = await import('./src/quantityGuard.js');
  const agent = m.buildAgent({ backendClient: createBackendClient(), foodsById: loadFoodsById() });
  console.log('Agent built OK:', typeof agent);
})
"`
Expected: prints `Agent built OK: object` with no thrown error — confirms `tool()`/`Agent` are called with valid shapes against the real installed SDK.

- [ ] **Step 3: Commit**

```bash
git add agent/src/agent.js
git commit -m "feat(agent): define system prompt and tool set for log/edit/delete/find meals"
```

---

### Task 6: `main.js` — worker entrypoint, `agent_status` lifecycle wiring, README

**Files:**
- Create: `agent/src/main.js`
- Create: `agent/README.md`

**Interfaces:**
- Consumes: `buildAgent` (Task 5), `createBackendClient` (Task 4), `loadFoodsById` (Task 3), `defineAgent`, `cli`, `WorkerOptions`, `AgentSession`, `AgentSessionEventTypes`, `inference` from `@livekit/agents`.
- Produces: the runnable agent process (`node src/main.js dev` / `start`). Nothing downstream depends on this file's exports — it's the composition root.

- [ ] **Step 1: Write `main.js`**

Create `agent/src/main.js`:

```javascript
// agent/src/main.js
import "dotenv/config";
import { defineAgent, cli, WorkerOptions, AgentSession, AgentSessionEventTypes, inference } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { buildAgent } from "./agent.js";
import { createBackendClient } from "./backendClient.js";
import { loadFoodsById } from "./quantityGuard.js";

// Maps the SDK's own agent-state lifecycle onto our agent_status SSE event.
// "awaiting_confirmation" is NOT one of the SDK's native states (listening/
// thinking/speaking/idle/initializing) — the agent posts that one explicitly
// itself, right before speaking a delete or quantity confirmation question,
// via backendClient.postAgentStatus directly (see agent.js's tool prompts).
const STATE_MAP = {
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    const backendClient = createBackendClient();
    const foodsById = loadFoodsById();
    const agent = buildAgent({ backendClient, foodsById });

    const session = new AgentSession({
      stt: "auto",
      llm: "openai/gpt-4o-mini",
      tts: "cartesia/sonic-2",
      vad: new inference.VAD(),
    });

    session.on(AgentSessionEventTypes.AgentStateChanged, (event) => {
      const status = STATE_MAP[event.newState];
      if (status) {
        backendClient.postAgentStatus({ status }).catch((err) => {
          console.error("Failed to post agent_status:", err.message);
        });
      }
    });

    await session.start({ agent, room: ctx.room });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
```

- [ ] **Step 2: Verify the worker boots (without live LiveKit credentials)**

Run: `cd agent && node src/main.js --help`
Expected: prints the LiveKit Agents CLI's help/usage output (subcommands like `start`, `dev`, `download-files`) without throwing — confirms `WorkerOptions`/`cli.runApp` are wired correctly against the real SDK, independent of whether real `LIVEKIT_*` credentials are set yet.

- [ ] **Step 3: Write `agent/README.md`**

Create `agent/README.md`:

```markdown
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

Exposes five tools to the LLM: `log_meal`, `edit_meal`, `delete_meal`,
`find_recent_meals`, `check_quantity_plausible`. Every `log_meal`/`edit_meal`
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
```

- [ ] **Step 4: Update root `TODOS.md`**

Modify `TODOS.md` — add a new section noting the language change from the
design doc's original Python assumption:

```markdown
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
```

- [ ] **Step 5: Run the full agent test suite**

Run: `cd agent && npm test`
Expected: PASS (all `quantityGuard`/`backendClient` tests from Tasks 3-4)

- [ ] **Step 6: Commit**

```bash
git add agent/src/main.js agent/README.md TODOS.md
git commit -m "feat(agent): wire worker entrypoint, agent_status lifecycle, and README"
```

---

## After this plan

Manual verification (not part of this plan's automated steps, since it needs
real LiveKit credentials the user owns):

1. Fill in real `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` in
   `agent/.env`.
2. Start the backend (`cd backend && npm start`), then the agent
   (`cd agent && npm run dev`).
3. Use LiveKit's playground to test: logging a single food, logging two
   foods in one utterance, an ambiguous food name, a food not on the list,
   an implausible quantity ("twenty rotis"), and the delete-confirmation
   flow (say delete, confirm, verify only one `DELETE` call happens).
4. Confirm `GET /api/events` (e.g. via `curl -N`) shows `agent_status`
   events alongside the existing `meal_logged`/`meal_updated`/`meal_deleted`
   events during that session.

This is Next Steps #2's own "test via LiveKit's text/playground mode before
real voice" step from the design doc — captured here as a checklist, not
automated, since live audio interaction isn't unit-testable.
