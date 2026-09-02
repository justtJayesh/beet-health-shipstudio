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
