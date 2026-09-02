// agent/test/quantityGuard.test.js
import { describe, it, expect } from "vitest";
import { isImplausible, loadFoodsById, findFoodByPhrase } from "../src/quantityGuard.js";

const sampleFoods = new Map([
  ["roti", { id: "roti", name: "Roti", aliases: ["chapati", "phulka"], units: [{ name: "piece", grams: 40 }, { name: "gram", grams: 1 }] }],
  ["plain_rice", { id: "plain_rice", name: "Plain Rice (cooked)", aliases: ["rice", "chawal"], units: [{ name: "katori", grams: 150 }, { name: "plate", grams: 300 }, { name: "gram", grams: 1 }] }],
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

  it("treats a non-finite or negative quantity as implausible instead of failing open", () => {
    expect(isImplausible({ foodId: "roti", quantity: NaN, unit: "piece", foodsById: sampleFoods })).toBe(true);
    expect(isImplausible({ foodId: "roti", quantity: Infinity, unit: "piece", foodsById: sampleFoods })).toBe(true);
    expect(isImplausible({ foodId: "roti", quantity: -1, unit: "piece", foodsById: sampleFoods })).toBe(true);
  });
});

describe("findFoodByPhrase", () => {
  it("resolves an exact name match", () => {
    expect(findFoodByPhrase("Roti", sampleFoods)).toBe(sampleFoods.get("roti"));
  });

  it("resolves an alias match, case-insensitively", () => {
    expect(findFoodByPhrase("CHAPATI", sampleFoods)).toBe(sampleFoods.get("roti"));
    expect(findFoodByPhrase("rice", sampleFoods)).toBe(sampleFoods.get("plain_rice"));
  });

  it("returns null for no match", () => {
    expect(findFoodByPhrase("pizza", sampleFoods)).toBeNull();
  });
});

describe("loadFoodsById", () => {
  it("loads the real repo-root foods.json into a Map keyed by id", () => {
    const foodsById = loadFoodsById();
    expect(foodsById.get("roti").name).toBe("Roti");
    expect(foodsById.size).toBeGreaterThan(0);
  });
});
