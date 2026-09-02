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
