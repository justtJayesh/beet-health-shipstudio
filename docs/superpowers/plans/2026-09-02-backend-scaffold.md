# Backend Scaffold (Next Steps #1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node/Express/MongoDB backend layer (foods resolver, macro calculator, meal schema, REST endpoints, SSE broadcast) for the voice meal-logging agent, testable standalone via curl and Vitest before any voice/LiveKit work starts.

**Architecture:** A small Express app in `backend/` with one Mongoose model (`Meal`), two pure services (`foodsResolver`, `mealMacros`), an SSE broadcast hub, and two route modules (`foods`, `meals`) that both go through the shared resolve-and-recompute path. Foods data loads once from the repo-root `foods.json` into an in-memory index built at app-construction time (not module-load time), so tests can inject a small fixture index instead of the real 30-food set.

**Tech Stack:** Node.js (ESM), Express 4, Mongoose 8, `fastest-levenshtein`, Vitest, `mongodb-memory-server` (test-only, avoids requiring a real Mongo instance for the test suite).

**Spec:** `docs/designs/voice-meal-logging-agent.md` (the fully `/autoplan`-reviewed design doc — read its "System sketch → Backend" section, the Test Coverage Diagram, and the Phase 1/2/2.5/3 review additions before touching any task below; this plan implements Next Steps #1 only, not the LiveKit agent or frontend).

## Global Constraints

- All data comes from the repo-root `foods.json` (30 dishes) — nothing outside that closed set can ever be logged. Path: `<repo-root>/foods.json` (already present, verified 30 entries with shape `{id, name, aliases, macrosPer100g:{calories,protein,carbs,fat}, units:[{name,grams}]}`).
- Every Meal is scoped to `DEFAULT_USER_ID = 'default-user'` (single fixed user, no auth) — every write and query filters by it.
- `grams = quantity × gramsPerUnit`, where `gramsPerUnit` comes only from the resolved food's `units` array — never a separate conversion table.
- Macro calculation (`macrosPer100g × grams / 100`) happens server-side only, in one shared function used by both the log path and the edit path (including a food-swap edit) — never duplicated.
- Food/unit resolution match order: exact name/id → alias table → fuzzy fallback (Levenshtein distance ≤ 2) → no match. Fuzzy threshold is length-aware: distance ≤ 1 for queries of 5 characters or fewer, distance ≤ 2 otherwise (closes Reviewer Concern #6 on short-alias false-positive collisions, approved as an in-scope expansion in the `/autoplan` Phase 1 review).
- Two or more foods within the fuzzy threshold → `ambiguous` outcome with all candidates, never a silent pick.
- `POST /api/meals` supports an optional `idempotencyKey`; a retried call with the same key for the same user returns the existing meal instead of creating a duplicate (`/autoplan` Phase 3, Decision #34 — prevents a silent duplicate-write on a lost tool-call response).
- `foods.json` missing or unreadable at boot must fail fast with a clear message naming the expected path, not a raw stack trace (`/autoplan` Phase 3, Decision #38).
- Mongo query pattern: `{userId, loggedAt}` compound index for the recency-scoped list query (Performance Review in the design doc).
- Every new module gets Vitest coverage in this plan — no "add tests later."
- ESM throughout (`"type": "module"` in `package.json`); no CommonJS `require`.

---

### Task 1: Backend project scaffold, constants, and DB connection

**Files:**
- Create: `backend/package.json`
- Create: `backend/vitest.config.js`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/src/constants.js`
- Create: `backend/src/db.js`
- Test: `backend/test/db.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `DEFAULT_USER_ID` (string constant, from `constants.js`) — used by every later task's Mongo queries. `connectDB(uri)` and `disconnectDB()` (both `async`, from `db.js`) — `connectDB` returns the `mongoose.connection` object.

- [ ] **Step 1: Write `backend/package.json`**

```json
{
  "name": "beet-backend",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "fastest-levenshtein": "^1.0.16",
    "mongoose": "^8.5.0"
  },
  "devDependencies": {
    "mongodb-memory-server": "^9.4.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `backend/vitest.config.js`**

```javascript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 3: Write `backend/.env.example`**

```
# Copy this file to .env and adjust if needed. Both vars have working defaults
# for local dev, so `cp .env.example .env` with no edits is enough to start.
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/beet-health
```

- [ ] **Step 4: Write `backend/.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 5: Write `backend/src/constants.js`**

```javascript
// Single fixed user, no auth — every Meal write/query is scoped to this id.
export const DEFAULT_USER_ID = "default-user";
```

- [ ] **Step 6: Write `backend/src/db.js`**

```javascript
import mongoose from "mongoose";

export async function connectDB(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
```

- [ ] **Step 7: Install dependencies**

Run: `cd backend && npm install`
Expected: `package-lock.json` created, `node_modules/` populated, exit code 0.

- [ ] **Step 8: Write the failing test for `db.js`**

```javascript
// backend/test/db.test.js
import { describe, it, expect, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDB, disconnectDB } from "../src/db.js";

describe("connectDB", () => {
  afterEach(async () => {
    await disconnectDB();
  });

  it("connects mongoose to the given URI", async () => {
    const mongod = await MongoMemoryServer.create();
    const connection = await connectDB(mongod.getUri());
    expect(connection.readyState).toBe(1); // 1 = connected
    await mongod.stop();
  });
});
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/db.test.js`
Expected: PASS (1/1). This confirms `mongodb-memory-server` works in this environment before later tasks depend on it.

- [ ] **Step 10: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.js \
  backend/.env.example backend/.gitignore backend/src/constants.js backend/src/db.js \
  backend/test/db.test.js
git commit -m "chore: scaffold backend project, DB connection helper"
```

---

### Task 2: Meal Mongoose schema

**Files:**
- Create: `backend/src/models/Meal.js`
- Test: `backend/test/models/Meal.test.js`

**Interfaces:**
- Consumes: `DEFAULT_USER_ID` from `backend/src/constants.js` (only used in the test, not the model itself — the model takes whatever `userId` it's given).
- Produces: `Meal` (default export... no — **named export** `Meal`, the Mongoose model) with fields `{userId, foodId, name, quantity, unit, grams, macros:{calories,protein,carbs,fat}, mealType, loggedAt, idempotencyKey, createdAt, updatedAt}`. Later tasks (`mealMacros`, `meals` route) import `{ Meal }` from `"../models/Meal.js"` and construct/query documents with exactly these field names.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/models/Meal.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Meal } from "../../src/models/Meal.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Meal.deleteMany({});
});

describe("Meal schema", () => {
  const validMeal = () => ({
    userId: "default-user",
    foodId: "roti",
    name: "Roti",
    quantity: 2,
    unit: "piece",
    grams: 80,
    macros: { calories: 238, protein: 9, carbs: 46.4, fat: 3 },
    mealType: "breakfast",
    loggedAt: new Date(),
  });

  it("saves a valid meal and stamps createdAt/updatedAt", async () => {
    const meal = await Meal.create(validMeal());
    expect(meal.createdAt).toBeInstanceOf(Date);
    expect(meal.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a mealType outside the enum", async () => {
    await expect(Meal.create({ ...validMeal(), mealType: "brunch" })).rejects.toThrow();
  });

  it("rejects a negative quantity", async () => {
    await expect(Meal.create({ ...validMeal(), quantity: -1 })).rejects.toThrow();
  });

  it("allows two meals with no idempotencyKey (field is optional)", async () => {
    await Meal.create(validMeal());
    await expect(Meal.create(validMeal())).resolves.toBeDefined();
  });

  it("rejects two meals for the same user with the same idempotencyKey", async () => {
    await Meal.create({ ...validMeal(), idempotencyKey: "key-1" });
    await expect(
      Meal.create({ ...validMeal(), idempotencyKey: "key-1" })
    ).rejects.toThrow();
  });

  it("allows the same idempotencyKey for two different users", async () => {
    await Meal.create({ ...validMeal(), userId: "user-a", idempotencyKey: "key-1" });
    await expect(
      Meal.create({ ...validMeal(), userId: "user-b", idempotencyKey: "key-1" })
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/models/Meal.test.js`
Expected: FAIL — `Cannot find module '../../src/models/Meal.js'`.

- [ ] **Step 3: Write the model**

```javascript
// backend/src/models/Meal.js
import mongoose from "mongoose";

const MacrosSchema = new mongoose.Schema(
  {
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
  },
  { _id: false }
);

const MealSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    foodId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    grams: { type: Number, required: true, min: 0 },
    macros: { type: MacrosSchema, required: true },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      required: true,
    },
    loggedAt: { type: Date, required: true },
    // Optional. When present, a retried log_meal call with the same key
    // for the same user returns the existing meal instead of duplicating it.
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

// Recency-scoped list query (GET /api/meals, find_recent_meals) — see
// Performance Review in the design doc.
MealSchema.index({ userId: 1, loggedAt: -1 });

// Unique only when idempotencyKey is actually a string, so meals without
// one (the common case) never collide with each other.
MealSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export const Meal = mongoose.model("Meal", MealSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/models/Meal.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/Meal.js backend/test/models/Meal.test.js
git commit -m "feat: add Meal schema with userId scoping and idempotency index"
```

---

### Task 3: Foods resolver service

**Files:**
- Create: `backend/src/services/foodsResolver.js`
- Test: `backend/test/services/foodsResolver.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (reads `foods.json` directly from disk).
- Produces: `buildFoodsIndex(foods?)`, `resolveFood(query, index)`, `validateUnit(food, unitName)`, `fuzzyThreshold(query)` — all named exports from `foodsResolver.js`. `resolveFood` returns `{outcome: "match", food, matchType} | {outcome: "ambiguous", candidates: [{id, name}]} | {outcome: "no_match"}`. `validateUnit` returns `{name, gramsPerUnit} | null`. Task 4 (`mealMacros`) imports `resolveFood` and `validateUnit`. Task 6/7 (routes) import `buildFoodsIndex`.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/services/foodsResolver.test.js
import { describe, it, expect } from "vitest";
import {
  buildFoodsIndex,
  resolveFood,
  validateUnit,
  fuzzyThreshold,
} from "../../src/services/foodsResolver.js";

const sampleFoods = [
  {
    id: "roti",
    name: "Roti",
    aliases: ["chapati", "phulka", "wheat roti"],
    macrosPer100g: { calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 },
    units: [
      { name: "piece", grams: 40 },
      { name: "gram", grams: 1 },
    ],
  },
  {
    id: "dal",
    name: "Dal",
    aliases: ["daal", "lentil curry"],
    macrosPer100g: { calories: 116, protein: 7.6, carbs: 16.0, fat: 2.7 },
    units: [
      { name: "katori", grams: 150 },
      { name: "gram", grams: 1 },
    ],
  },
  {
    id: "dahi",
    name: "Dahi",
    aliases: ["curd", "yogurt"],
    macrosPer100g: { calories: 60, protein: 3.1, carbs: 4.7, fat: 3.3 },
    units: [
      { name: "katori", grams: 150 },
      { name: "gram", grams: 1 },
    ],
  },
];

const index = buildFoodsIndex(sampleFoods);

describe("fuzzyThreshold", () => {
  it("uses distance 1 for queries of length <= 5", () => {
    expect(fuzzyThreshold("roti")).toBe(1);
    expect(fuzzyThreshold("aaaaa")).toBe(1);
  });

  it("uses distance 2 for queries longer than 5 characters", () => {
    expect(fuzzyThreshold("aaaaaa")).toBe(2);
  });
});

describe("resolveFood", () => {
  it("matches exact food name (case-insensitive)", () => {
    const result = resolveFood("ROTI", index);
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("roti");
    expect(result.matchType).toBe("exact");
  });

  it("matches exact food id", () => {
    const result = resolveFood("dal", index);
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("dal");
    expect(result.matchType).toBe("exact");
  });

  it("matches an alias", () => {
    const result = resolveFood("chapati", index);
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("roti");
    expect(result.matchType).toBe("alias");
  });

  it("matches a fuzzy misspelling within the length-aware threshold", () => {
    const result = resolveFood("rotti", index); // 1 insertion from "roti", length 5 -> threshold 1
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("roti");
    expect(result.matchType).toBe("fuzzy");
  });

  it("returns ambiguous when two foods are within the fuzzy threshold", () => {
    const result = resolveFood("dahl", index); // 1 edit from both "dal" and "dahi"
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["dahi", "dal"]);
  });

  it("returns no_match for a food outside the closed 30-food set", () => {
    const result = resolveFood("pizza", index);
    expect(result).toEqual({ outcome: "no_match" });
  });

  it("returns no_match for an empty query", () => {
    expect(resolveFood("   ", index)).toEqual({ outcome: "no_match" });
  });
});

describe("validateUnit", () => {
  it("returns gramsPerUnit for a known unit (case-insensitive)", () => {
    expect(validateUnit(sampleFoods[0], "PIECE")).toEqual({ name: "piece", gramsPerUnit: 40 });
  });

  it("returns null for a unit not listed for that food", () => {
    expect(validateUnit(sampleFoods[0], "katori")).toBeNull();
  });
});

describe("buildFoodsIndex (default, reads repo-root foods.json)", () => {
  it("loads exactly 30 foods with the expected shape", () => {
    const realIndex = buildFoodsIndex();
    expect(realIndex.foods).toHaveLength(30);
    for (const food of realIndex.foods) {
      expect(food).toHaveProperty("id");
      expect(food).toHaveProperty("name");
      expect(food).toHaveProperty("macrosPer100g");
      expect(Array.isArray(food.units)).toBe(true);
      expect(food.units.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/services/foodsResolver.test.js`
Expected: FAIL — `Cannot find module '../../src/services/foodsResolver.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// backend/src/services/foodsResolver.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { distance } from "fastest-levenshtein";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/services -> backend/src -> backend -> repo root
const FOODS_JSON_PATH = path.join(__dirname, "..", "..", "..", "foods.json");

function loadFoods(foodsPath = FOODS_JSON_PATH) {
  let raw;
  try {
    raw = readFileSync(foodsPath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `foods.json not found at ${foodsPath}. Copy the assignment-provided foods.json ` +
          `into the repo root before starting the backend.`
      );
    }
    throw err;
  }
  return JSON.parse(raw).foods;
}

function normalize(str) {
  return String(str).trim().toLowerCase();
}

export function fuzzyThreshold(query) {
  return query.length <= 5 ? 1 : 2;
}

export function buildFoodsIndex(foods = loadFoods()) {
  const byExact = new Map();
  const byAlias = new Map();
  for (const food of foods) {
    byExact.set(normalize(food.name), food);
    byExact.set(normalize(food.id), food);
    for (const alias of food.aliases ?? []) {
      byAlias.set(normalize(alias), food);
    }
  }
  return { foods, byExact, byAlias };
}

export function resolveFood(query, index) {
  const q = normalize(query);
  if (!q) {
    return { outcome: "no_match" };
  }

  const exact = index.byExact.get(q);
  if (exact) {
    return { outcome: "match", food: exact, matchType: "exact" };
  }

  const alias = index.byAlias.get(q);
  if (alias) {
    return { outcome: "match", food: alias, matchType: "alias" };
  }

  const threshold = fuzzyThreshold(q);
  const candidates = new Map(); // food.id -> food

  for (const food of index.foods) {
    const terms = [food.name, food.id, ...(food.aliases ?? [])];
    let best = Infinity;
    for (const term of terms) {
      const d = distance(q, normalize(term));
      if (d < best) best = d;
    }
    if (best <= threshold) {
      candidates.set(food.id, food);
    }
  }

  if (candidates.size === 0) {
    return { outcome: "no_match" };
  }
  if (candidates.size === 1) {
    const [food] = candidates.values();
    return { outcome: "match", food, matchType: "fuzzy" };
  }
  return {
    outcome: "ambiguous",
    candidates: [...candidates.values()].map((food) => ({ id: food.id, name: food.name })),
  };
}

export function validateUnit(food, unitName) {
  const q = normalize(unitName);
  const unit = food.units.find((u) => normalize(u.name) === q);
  return unit ? { name: unit.name, gramsPerUnit: unit.grams } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/services/foodsResolver.test.js`
Expected: PASS (11/11).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/foodsResolver.js backend/test/services/foodsResolver.test.js
git commit -m "feat: add foods resolver (exact/alias/fuzzy/ambiguous/no_match)"
```

---

### Task 4: Meal macros service (shared resolve-and-recompute path)

**Files:**
- Create: `backend/src/services/mealMacros.js`
- Test: `backend/test/services/mealMacros.test.js`

**Interfaces:**
- Consumes: `resolveFood`, `validateUnit` from `backend/src/services/foodsResolver.js` (Task 3); `buildFoodsIndex` in the test only.
- Produces: `computeMacros(macrosPer100g, grams)`, `resolveMealFields({foodQuery, quantity, unit}, index)`, `FoodResolutionError`, `InvalidUnitError` — named exports. `resolveMealFields` returns `{foodId, name, quantity, unit, grams, macros}` on success or throws one of the two error classes. Task 7 (`meals` route) imports all four and uses `resolveMealFields` for both the log path and the edit path (including food-swap edits) — this is the ONE shared function, never duplicated.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/services/mealMacros.test.js
import { describe, it, expect } from "vitest";
import { buildFoodsIndex } from "../../src/services/foodsResolver.js";
import {
  computeMacros,
  resolveMealFields,
  FoodResolutionError,
  InvalidUnitError,
} from "../../src/services/mealMacros.js";

const sampleFoods = [
  {
    id: "roti",
    name: "Roti",
    aliases: ["chapati"],
    macrosPer100g: { calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 },
    units: [{ name: "piece", grams: 40 }],
  },
];
const index = buildFoodsIndex(sampleFoods);

describe("computeMacros", () => {
  it("scales macrosPer100g to the actual gram amount", () => {
    expect(computeMacros({ calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 }, 40)).toEqual({
      calories: 119,
      protein: 4.5,
      carbs: 23.2,
      fat: 1.5,
    });
  });

  it("rounds calories to a whole number and other macros to 1 decimal", () => {
    const result = computeMacros({ calories: 100, protein: 10, carbs: 10, fat: 10 }, 33);
    expect(result).toEqual({ calories: 33, protein: 3.3, carbs: 3.3, fat: 3.3 });
  });
});

describe("resolveMealFields", () => {
  it("resolves a food+quantity+unit into grams and macros", () => {
    const fields = resolveMealFields({ foodQuery: "roti", quantity: 2, unit: "piece" }, index);
    expect(fields).toEqual({
      foodId: "roti",
      name: "Roti",
      quantity: 2,
      unit: "piece",
      grams: 80,
      macros: { calories: 238, protein: 9, carbs: 46.4, fat: 3 },
    });
  });

  it("resolves via alias just like via the canonical name", () => {
    const viaAlias = resolveMealFields({ foodQuery: "chapati", quantity: 1, unit: "piece" }, index);
    const viaName = resolveMealFields({ foodQuery: "roti", quantity: 1, unit: "piece" }, index);
    expect(viaAlias).toEqual(viaName);
  });

  it("throws FoodResolutionError for a food outside the closed set", () => {
    expect(() =>
      resolveMealFields({ foodQuery: "pizza", quantity: 1, unit: "piece" }, index)
    ).toThrow(FoodResolutionError);
  });

  it("throws InvalidUnitError for a unit not valid for the resolved food", () => {
    expect(() =>
      resolveMealFields({ foodQuery: "roti", quantity: 1, unit: "katori" }, index)
    ).toThrow(InvalidUnitError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/services/mealMacros.test.js`
Expected: FAIL — `Cannot find module '../../src/services/mealMacros.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// backend/src/services/mealMacros.js
import { resolveFood, validateUnit } from "./foodsResolver.js";

export class FoodResolutionError extends Error {
  constructor(outcome, candidates) {
    super(`food resolution failed: ${outcome}`);
    this.name = "FoodResolutionError";
    this.outcome = outcome; // "no_match" | "ambiguous"
    this.candidates = candidates;
  }
}

export class InvalidUnitError extends Error {
  constructor(unit, foodName) {
    super(`unit "${unit}" is not valid for food "${foodName}"`);
    this.name = "InvalidUnitError";
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function computeMacros(macrosPer100g, grams) {
  const factor = grams / 100;
  return {
    calories: Math.round(macrosPer100g.calories * factor),
    protein: round1(macrosPer100g.protein * factor),
    carbs: round1(macrosPer100g.carbs * factor),
    fat: round1(macrosPer100g.fat * factor),
  };
}

// The ONE resolve-and-recompute path shared by the log endpoint and the
// edit endpoint's food-swap case — see design doc "Macro calculation always
// happens server-side... single shared internal function."
export function resolveMealFields({ foodQuery, quantity, unit }, index) {
  const resolution = resolveFood(foodQuery, index);
  if (resolution.outcome !== "match") {
    throw new FoodResolutionError(resolution.outcome, resolution.candidates);
  }

  const { food } = resolution;
  const validUnit = validateUnit(food, unit);
  if (!validUnit) {
    throw new InvalidUnitError(unit, food.name);
  }

  const grams = quantity * validUnit.gramsPerUnit;
  const macros = computeMacros(food.macrosPer100g, grams);

  return {
    foodId: food.id,
    name: food.name,
    quantity,
    unit: validUnit.name,
    grams,
    macros,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/services/mealMacros.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mealMacros.js backend/test/services/mealMacros.test.js
git commit -m "feat: add shared resolve-and-recompute macro service"
```

---

### Task 5: SSE broadcast hub

**Files:**
- Create: `backend/src/sse/broadcast.js`
- Test: `backend/test/sse/broadcast.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `registerClient(res)`, `broadcast(event)`, `clientCount()`, `_resetForTests()` — named exports. `res` is any object with a `.write(chunk)` method and that emits a `"close"` event (an Express `Response` satisfies this). Task 6/7 (`server.js`, `meals` route) import `registerClient` and `broadcast`.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/sse/broadcast.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { registerClient, broadcast, clientCount, _resetForTests } from "../../src/sse/broadcast.js";

function makeFakeResponse() {
  const res = new EventEmitter();
  res.written = [];
  res.write = (chunk) => res.written.push(chunk);
  return res;
}

beforeEach(() => {
  _resetForTests();
});

describe("SSE broadcast", () => {
  it("registers a client and delivers a broadcast event to it as an SSE frame", () => {
    const res = makeFakeResponse();
    registerClient(res);
    expect(clientCount()).toBe(1);

    broadcast({ type: "meal_logged", meal: { id: "1" } });

    expect(res.written).toHaveLength(1);
    expect(res.written[0]).toBe('data: {"type":"meal_logged","meal":{"id":"1"}}\n\n');
  });

  it("removes a client on close so it stops receiving events", () => {
    const res = makeFakeResponse();
    registerClient(res);
    res.emit("close");
    expect(clientCount()).toBe(0);

    broadcast({ type: "meal_deleted", meal: { id: "1" } });
    expect(res.written).toHaveLength(0);
  });

  it("broadcasts to every registered client", () => {
    const res1 = makeFakeResponse();
    const res2 = makeFakeResponse();
    registerClient(res1);
    registerClient(res2);

    broadcast({ type: "meal_updated", meal: { id: "2" } });

    expect(res1.written).toHaveLength(1);
    expect(res2.written).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/sse/broadcast.test.js`
Expected: FAIL — `Cannot find module '../../src/sse/broadcast.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// backend/src/sse/broadcast.js
const clients = new Set();

export function registerClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

export function clientCount() {
  return clients.size;
}

// Test-only: SSE clients are process-global state, so tests must reset it
// between cases instead of re-importing the module.
export function _resetForTests() {
  clients.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/sse/broadcast.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sse/broadcast.js backend/test/sse/broadcast.test.js
git commit -m "feat: add SSE broadcast hub"
```

---

### Task 6: `GET /api/foods/resolve` route + app factory

**Files:**
- Create: `backend/src/routes/foods.js`
- Create: `backend/src/server.js`
- Test: `backend/test/routes/foods.test.js`

**Interfaces:**
- Consumes: `resolveFood`, `buildFoodsIndex` from `foodsResolver.js` (Task 3); `registerClient` from `broadcast.js` (Task 5); `connectDB` from `db.js` (Task 1).
- Produces: `createFoodsRouter({index})` (named export, returns an Express `Router`) from `routes/foods.js`. `createApp({index})` (named export, returns an Express `app`, does NOT connect to Mongo or start listening) from `server.js` — Task 7 adds the meals router into this same `createApp`, and every route test in this plan uses `createApp` to get a fresh app instance without a real server process.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/routes/foods.test.js
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/server.js";
import { buildFoodsIndex } from "../../src/services/foodsResolver.js";

const sampleFoods = [
  {
    id: "roti",
    name: "Roti",
    aliases: ["chapati"],
    macrosPer100g: { calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 },
    units: [{ name: "piece", grams: 40 }],
  },
];

let server;
let baseUrl;

beforeAll(async () => {
  const app = createApp({ index: buildFoodsIndex(sampleFoods) });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
});

describe("GET /api/foods/resolve", () => {
  it("returns a match for an exact food name", async () => {
    const res = await fetch(`${baseUrl}/api/foods/resolve?q=roti`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outcome).toBe("match");
    expect(body.food.id).toBe("roti");
    expect(body.food.units).toEqual([{ name: "piece", grams: 40 }]);
  });

  it("returns no_match for a food outside the closed set", async () => {
    const res = await fetch(`${baseUrl}/api/foods/resolve?q=pizza`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outcome).toBe("no_match");
  });

  it("returns 400 when q is missing", async () => {
    const res = await fetch(`${baseUrl}/api/foods/resolve`);
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is blank", async () => {
    const res = await fetch(`${baseUrl}/api/foods/resolve?q=%20%20`);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes/foods.test.js`
Expected: FAIL — `Cannot find module '../../src/server.js'`.

- [ ] **Step 3: Write `backend/src/routes/foods.js`**

```javascript
// backend/src/routes/foods.js
import express from "express";
import { resolveFood } from "../services/foodsResolver.js";

export function createFoodsRouter({ index }) {
  const router = express.Router();

  router.get("/resolve", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      return res.status(400).json({ error: "missing required query param \"q\"" });
    }

    const result = resolveFood(q, index);

    if (result.outcome === "match") {
      return res.json({
        outcome: "match",
        food: { id: result.food.id, name: result.food.name, units: result.food.units },
        matchType: result.matchType,
      });
    }
    if (result.outcome === "ambiguous") {
      return res.json({ outcome: "ambiguous", candidates: result.candidates });
    }
    return res.json({ outcome: "no_match" });
  });

  return router;
}
```

- [ ] **Step 4: Write `backend/src/server.js`**

```javascript
// backend/src/server.js
import "dotenv/config";
import express from "express";
import { createFoodsRouter } from "./routes/foods.js";
import { registerClient } from "./sse/broadcast.js";
import { buildFoodsIndex } from "./services/foodsResolver.js";
import { connectDB } from "./db.js";

// Builds the Express app without connecting to Mongo or listening — lets
// tests get a fresh app per file with an injected foods index.
export function createApp({ index = buildFoodsIndex() } = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    registerClient(res);
  });

  app.use("/api/foods", createFoodsRouter({ index }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

async function main() {
  const port = process.env.PORT ?? 3001;
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set — copy .env.example to .env first.");
    process.exit(1);
  }
  await connectDB(mongoUri);
  const app = createApp();
  app.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes/foods.test.js`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/foods.js backend/src/server.js backend/test/routes/foods.test.js
git commit -m "feat: add GET /api/foods/resolve route and app factory"
```

---

### Task 7: Meals CRUD routes, wired to SSE

**Files:**
- Create: `backend/src/routes/meals.js`
- Modify: `backend/src/server.js` (mount the meals router)
- Test: `backend/test/routes/meals.test.js`

**Interfaces:**
- Consumes: `Meal` (Task 2); `resolveMealFields`, `FoodResolutionError`, `InvalidUnitError` (Task 4); `broadcast` (Task 5); `DEFAULT_USER_ID` (Task 1); `createApp` (Task 6, extended here).
- Produces: `createMealsRouter({index})` (named export, returns an Express `Router`) from `routes/meals.js`. No later task in this plan consumes this directly — it's the last route module.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/test/routes/meals.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createApp } from "../../src/server.js";
import { buildFoodsIndex } from "../../src/services/foodsResolver.js";
import { Meal } from "../../src/models/Meal.js";

const sampleFoods = [
  {
    id: "roti",
    name: "Roti",
    aliases: ["chapati"],
    macrosPer100g: { calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 },
    units: [{ name: "piece", grams: 40 }],
  },
  {
    id: "dal",
    name: "Dal",
    aliases: ["daal"],
    macrosPer100g: { calories: 116, protein: 7.6, carbs: 16.0, fat: 2.7 },
    units: [{ name: "katori", grams: 150 }],
  },
];

let mongod;
let server;
let baseUrl;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp({ index: buildFoodsIndex(sampleFoods) });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Meal.deleteMany({});
});

async function postMeal(body) {
  const res = await fetch(`${baseUrl}/api/meals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/meals", () => {
  it("logs a meal and computes macros server-side", async () => {
    const { status, body } = await postMeal({
      food: "roti",
      quantity: 2,
      unit: "piece",
      mealType: "breakfast",
    });
    expect(status).toBe(201);
    expect(body.meal.foodId).toBe("roti");
    expect(body.meal.grams).toBe(80);
    expect(body.meal.macros.calories).toBe(238);
    expect(body.meal.mealType).toBe("breakfast");
  });

  it("infers mealType from server time when not given", async () => {
    const { status, body } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    expect(status).toBe(201);
    expect(["breakfast", "lunch", "dinner", "snack"]).toContain(body.meal.mealType);
  });

  it("rejects a food outside the closed 30-food set", async () => {
    const { status, body } = await postMeal({ food: "pizza", quantity: 1, unit: "piece" });
    expect(status).toBe(422);
    expect(body.error).toBe("no_match");
  });

  it("rejects a unit not valid for the resolved food", async () => {
    const { status, body } = await postMeal({ food: "roti", quantity: 1, unit: "katori" });
    expect(status).toBe(422);
    expect(body.error).toBe("invalid_unit");
  });

  it("rejects a request missing quantity", async () => {
    const { status } = await postMeal({ food: "roti", unit: "piece" });
    expect(status).toBe(400);
  });

  it("deduplicates a retried log_meal call with the same idempotencyKey", async () => {
    const first = await postMeal({
      food: "roti",
      quantity: 1,
      unit: "piece",
      idempotencyKey: "abc-123",
    });
    const second = await postMeal({
      food: "roti",
      quantity: 1,
      unit: "piece",
      idempotencyKey: "abc-123",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);
    expect(second.body.meal._id).toBe(first.body.meal._id);

    const count = await Meal.countDocuments({});
    expect(count).toBe(1);
  });
});

describe("PATCH /api/meals/:id", () => {
  it("edits quantity and recomputes macros through the shared path", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 3 }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meal.quantity).toBe(3);
    expect(body.meal.grams).toBe(120);
  });

  it("swaps the food and recomputes through the same shared resolve path", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food: "dal", quantity: 1, unit: "katori" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meal.foodId).toBe("dal");
    expect(body.meal.grams).toBe(150);
  });

  it("rejects an edit that swaps to a food outside the closed set", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food: "pizza" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for a meal that does not exist", async () => {
    const res = await fetch(`${baseUrl}/api/meals/000000000000000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/meals/:id", () => {
  it("deletes a meal", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const count = await Meal.countDocuments({});
    expect(count).toBe(0);
  });

  it("returns 404 for a meal that does not exist", async () => {
    const res = await fetch(`${baseUrl}/api/meals/000000000000000000000000`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/meals", () => {
  it("lists meals scoped to the default user, newest first", async () => {
    await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    await postMeal({ food: "dal", quantity: 1, unit: "katori" });

    const res = await fetch(`${baseUrl}/api/meals`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meals).toHaveLength(2);
    expect(body.meals[0].foodId).toBe("dal"); // most recently logged first
  });

  it("filters by a recency window via ?hours=", async () => {
    await postMeal({ food: "roti", quantity: 1, unit: "piece" });

    const res = await fetch(`${baseUrl}/api/meals?hours=1`);
    const body = await res.json();
    expect(body.meals).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/routes/meals.test.js`
Expected: FAIL — `/api/meals` returns 404 (router not mounted yet).

- [ ] **Step 3: Write `backend/src/routes/meals.js`**

```javascript
// backend/src/routes/meals.js
import express from "express";
import { Meal } from "../models/Meal.js";
import { DEFAULT_USER_ID } from "../constants.js";
import {
  resolveMealFields,
  FoodResolutionError,
  InvalidUnitError,
} from "../services/mealMacros.js";
import { broadcast } from "../sse/broadcast.js";

function inferMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function respondResolutionError(res, err) {
  if (err instanceof FoodResolutionError) {
    return res.status(422).json({ error: err.outcome, candidates: err.candidates });
  }
  if (err instanceof InvalidUnitError) {
    return res.status(422).json({ error: "invalid_unit", message: err.message });
  }
  throw err;
}

export function createMealsRouter({ index }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const { food, quantity, unit, mealType, idempotencyKey } = req.body ?? {};
    if (!food || quantity == null || !unit) {
      return res.status(400).json({ error: "food, quantity, and unit are required" });
    }

    if (idempotencyKey) {
      const existing = await Meal.findOne({ userId: DEFAULT_USER_ID, idempotencyKey });
      if (existing) {
        return res.status(200).json({ meal: existing, deduped: true });
      }
    }

    let fields;
    try {
      fields = resolveMealFields({ foodQuery: food, quantity, unit }, index);
    } catch (err) {
      return respondResolutionError(res, err);
    }

    const loggedAt = new Date();
    const meal = await Meal.create({
      userId: DEFAULT_USER_ID,
      ...fields,
      mealType: mealType ?? inferMealType(loggedAt),
      loggedAt,
      idempotencyKey,
    });

    broadcast({ type: "meal_logged", meal });
    return res.status(201).json({ meal });
  });

  router.patch("/:id", async (req, res) => {
    const meal = await Meal.findOne({ _id: req.params.id, userId: DEFAULT_USER_ID });
    if (!meal) {
      return res.status(404).json({ error: "meal_not_found" });
    }

    const { food, quantity, unit, mealType, loggedAt } = req.body ?? {};
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

    await meal.save();
    broadcast({ type: "meal_updated", meal });
    return res.json({ meal });
  });

  router.delete("/:id", async (req, res) => {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, userId: DEFAULT_USER_ID });
    if (!meal) {
      return res.status(404).json({ error: "meal_not_found" });
    }
    broadcast({ type: "meal_deleted", meal });
    return res.json({ meal });
  });

  router.get("/", async (req, res) => {
    const query = { userId: DEFAULT_USER_ID };
    if (req.query.since) {
      query.loggedAt = { $gte: new Date(req.query.since) };
    } else if (req.query.hours) {
      const hoursAgo = new Date(Date.now() - Number(req.query.hours) * 60 * 60 * 1000);
      query.loggedAt = { $gte: hoursAgo };
    }
    const meals = await Meal.find(query).sort({ loggedAt: -1 });
    return res.json({ meals });
  });

  return router;
}
```

- [ ] **Step 4: Modify `backend/src/server.js`** — mount the meals router alongside foods

```javascript
// backend/src/server.js — replace the import block and the createApp body below
import "dotenv/config";
import express from "express";
import { createFoodsRouter } from "./routes/foods.js";
import { createMealsRouter } from "./routes/meals.js";
import { registerClient } from "./sse/broadcast.js";
import { buildFoodsIndex } from "./services/foodsResolver.js";
import { connectDB } from "./db.js";

export function createApp({ index = buildFoodsIndex() } = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    registerClient(res);
  });

  app.use("/api/foods", createFoodsRouter({ index }));
  app.use("/api/meals", createMealsRouter({ index }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

async function main() {
  const port = process.env.PORT ?? 3001;
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set — copy .env.example to .env first.");
    process.exit(1);
  }
  await connectDB(mongoUri);
  const app = createApp();
  app.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/routes/meals.test.js`
Expected: PASS (13/13).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all suites pass (Tasks 1-7 combined).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/meals.js backend/src/server.js backend/test/routes/meals.test.js
git commit -m "feat: add meals CRUD routes with idempotency and SSE broadcast"
```

---

### Task 8: Standalone verification — README, env docs, curl smoke test

**Files:**
- Create: `backend/README.md`
- Create: `backend/scripts/smoke-test.sh`

**Interfaces:**
- Consumes: nothing new (documents and exercises the routes from Tasks 6-7 over HTTP).
- Produces: nothing later tasks import — this is the "test this layer standalone (curl/Postman)" deliverable Next Steps #1 calls for, and closes the DX review's "no env docs, no single run command, TTHW unbounded" finding.

- [ ] **Step 1: Write `backend/README.md`**

```markdown
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
```

- [ ] **Step 2: Write `backend/scripts/smoke-test.sh`**

```bash
#!/usr/bin/env bash
# Standalone curl smoke test against a running `npm start` backend.
# Exercises log -> edit -> delete end to end without any voice/LLM layer,
# per Next Steps #1's "test this layer standalone" requirement.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "== resolve a known food =="
RESOLVE_OUT=$(curl -sf "$BASE_URL/api/foods/resolve?q=roti")
echo "$RESOLVE_OUT"
check "outcome is match" "$([ "$(echo "$RESOLVE_OUT" | grep -c '"outcome":"match"')" = "1" ] && echo true || echo false)"

echo "== resolve a food outside the closed set =="
NOMATCH_OUT=$(curl -sf "$BASE_URL/api/foods/resolve?q=pizza")
echo "$NOMATCH_OUT"
check "outcome is no_match" "$([ "$(echo "$NOMATCH_OUT" | grep -c '"outcome":"no_match"')" = "1" ] && echo true || echo false)"

echo "== log a meal =="
LOG_OUT=$(curl -sf -X POST "$BASE_URL/api/meals" \
  -H "Content-Type: application/json" \
  -d '{"food":"roti","quantity":2,"unit":"piece","mealType":"breakfast"}')
echo "$LOG_OUT"
MEAL_ID=$(echo "$LOG_OUT" | sed -n 's/.*"_id":"\([a-f0-9]*\)".*/\1/p')
check "got a meal id back" "$([ -n "$MEAL_ID" ] && echo true || echo false)"

echo "== edit the meal's quantity =="
EDIT_OUT=$(curl -sf -X PATCH "$BASE_URL/api/meals/$MEAL_ID" \
  -H "Content-Type: application/json" \
  -d '{"quantity":3}')
echo "$EDIT_OUT"
check "quantity updated to 3" "$([ "$(echo "$EDIT_OUT" | grep -c '"quantity":3')" = "1" ] && echo true || echo false)"

echo "== list meals =="
LIST_OUT=$(curl -sf "$BASE_URL/api/meals")
check "listed meal includes our id" "$([ "$(echo "$LIST_OUT" | grep -c "$MEAL_ID")" -ge "1" ] && echo true || echo false)"

echo "== delete the meal =="
curl -sf -X DELETE "$BASE_URL/api/meals/$MEAL_ID" > /dev/null
LIST_AFTER=$(curl -sf "$BASE_URL/api/meals")
check "meal no longer listed after delete" "$([ "$(echo "$LIST_AFTER" | grep -c "$MEAL_ID")" = "0" ] && echo true || echo false)"

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
```

- [ ] **Step 3: Make the smoke test executable**

Run: `chmod +x backend/scripts/smoke-test.sh`

- [ ] **Step 4: Manually verify the smoke test against a live server**

Run (in one terminal): `cd backend && npm start`
Run (in another terminal): `cd backend && ./scripts/smoke-test.sh`
Expected: `6 passed, 0 failed` (adjust if you added/removed checks above — the point is 0 failed).

- [ ] **Step 5: Commit**

```bash
git add backend/README.md backend/scripts/smoke-test.sh
git commit -m "docs: add backend README, env docs, and curl smoke test"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Mongo schema ✅ (Task 2), foods loader with alias/fuzzy/ambiguous resolution ✅ (Task 3), REST endpoints ✅ (Tasks 6-7), SSE broadcast ✅ (Task 5, wired in Tasks 6-7), standalone curl+Vitest verification ✅ (Task 8 + every task's own test step). `DEFAULT_USER_ID` scoping ✅ (Task 1, applied in Task 7). `{userId, loggedAt}` index ✅ (Task 2). Idempotency (`/autoplan` Decision #34) ✅ (Tasks 2 and 7). foods.json-missing fail-fast (`/autoplan` Decision #38) ✅ (Task 3). Length-aware fuzzy threshold (Reviewer Concern #6) ✅ (Task 3).
- **Out of scope for this plan (later Next Steps, not dropped):** the LiveKit agent's per-item multi-item failure reporting and quantity sanity-bound soft confirm (`/autoplan` Decisions #35, #37) are agent-side behaviors — Next Steps #2, not this backend plan. The `agent_status` SSE event type (`/autoplan` Decision #43) is emitted by the agent's tool-call lifecycle, which doesn't exist yet; the broadcast hub built in Task 5 already supports adding it later with zero changes (it broadcasts arbitrary event objects). SSE reconnect merge/dedupe by `_id` (`/autoplan` Decision #36) is a frontend-side concern — Next Steps #4.
