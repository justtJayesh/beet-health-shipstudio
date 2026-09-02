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
  const candidates = new Map(); // food.id -> { food, dist }

  for (const food of index.foods) {
    const terms = [food.name, food.id, ...(food.aliases ?? [])];
    let best = Infinity;
    for (const term of terms) {
      const d = distance(q, normalize(term));
      if (d < best) best = d;
    }
    if (best <= threshold) {
      candidates.set(food.id, { food, dist: best });
    }
  }

  if (candidates.size === 0) {
    return { outcome: "no_match" };
  }

  // Among everything within the threshold, only the closest matches count as
  // real candidates — a strictly-closer single winner should resolve, not be
  // thrown into "ambiguous" alongside farther-off matches.
  const minDist = Math.min(...[...candidates.values()].map((c) => c.dist));
  const closest = [...candidates.values()].filter((c) => c.dist === minDist);

  if (closest.length === 1) {
    return { outcome: "match", food: closest[0].food, matchType: "fuzzy" };
  }
  return {
    outcome: "ambiguous",
    candidates: closest.map(({ food }) => ({ id: food.id, name: food.name })),
  };
}

export function validateUnit(food, unitName) {
  const q = normalize(unitName);
  const unit = food.units.find((u) => normalize(u.name) === q);
  return unit ? { name: unit.name, gramsPerUnit: unit.grams } : null;
}
