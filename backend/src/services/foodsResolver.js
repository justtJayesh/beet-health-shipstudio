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
