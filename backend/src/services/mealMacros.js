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
