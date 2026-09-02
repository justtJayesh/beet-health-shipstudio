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
  // Garbage quantity (NaN, Infinity, negative) fails toward MORE
  // confirmation, not less — this tool's whole job is asking the user to
  // confirm, so treat anything it can't reason about as implausible.
  if (!Number.isFinite(quantity) || quantity < 0) {
    return true;
  }
  const food = foodsById.get(foodId);
  if (!food) {
    throw new Error(`Unknown food id "${foodId}"`);
  }
  const grams = quantity * unitGrams(food, unit);
  const threshold = THRESHOLD_MULTIPLIER * largestUnitGrams(food);
  return grams > threshold;
}

// Resolves a spoken food phrase (e.g. "roti", "chapati") to its food record
// by case-insensitive match against each food's name and aliases. Exact
// match only — no fuzzy matching, that's the backend's job for the actual
// log_meal call; this only needs a good-enough resolution to run the
// quantity sanity check.
export function findFoodByPhrase(phrase, foodsById) {
  if (!phrase) return null;
  const needle = phrase.trim().toLowerCase();
  for (const food of foodsById.values()) {
    if (food.name?.toLowerCase() === needle) return food;
    if ((food.aliases ?? []).some((alias) => alias.toLowerCase() === needle)) return food;
  }
  return null;
}
