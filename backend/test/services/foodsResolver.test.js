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
  // Added for Finding 3's regression test: a food whose alias ("yoghurt") is
  // lexically close to dahi's alias ("yogurt"), but not equally close to a
  // given typo query.
  {
    id: "lassi",
    name: "Lassi",
    aliases: ["yoghurt"],
    macrosPer100g: { calories: 89, protein: 3.1, carbs: 12.0, fat: 2.5 },
    units: [{ name: "glass", grams: 250 }],
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

  it("returns ambiguous when two foods are within the fuzzy threshold and genuinely tied", () => {
    const result = resolveFood("dahl", index); // 1 edit from both "dal" and "dahi" — a real tie at the minimum distance
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["dahi", "dal"]);
  });

  it("resolves to the strictly-closer candidate instead of over-broad ambiguity (Finding 3 fix)", () => {
    // "yagurt" is within the old raw threshold (2, since length 6 > 5) of BOTH
    // dahi's alias "yogurt" (distance 1) and lassi's alias "yoghurt" (distance 2).
    // Before the fix, both were dumped into "ambiguous" candidates just for
    // passing the threshold. After the fix, only the minimum-distance
    // candidate (dahi, distance 1) counts — lassi (distance 2) is strictly
    // farther and should not force a clarifying question.
    const result = resolveFood("yagurt", index);
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("dahi");
    expect(result.matchType).toBe("fuzzy");
  });

  it("documents the accepted false-positive risk on short aliases: an unrelated word one edit " +
    "from a <=5-char alias still resolves (distance-1 threshold, Decision in backend-scaffold plan)", () => {
    // "silk" is an unrelated word, but it's a single substitution away from the
    // "milk" alias (4 chars, threshold 1) — this is the known, accepted tradeoff
    // of the length-aware threshold, not a bug. Locked down so a future
    // threshold change surfaces here instead of silently changing behavior.
    const foodsWithMilk = [
      ...sampleFoods,
      {
        id: "milk",
        name: "Milk",
        aliases: ["milk"],
        macrosPer100g: { calories: 42, protein: 3.4, carbs: 5.0, fat: 1.0 },
        units: [{ name: "glass", grams: 200 }],
      },
    ];
    const milkIndex = buildFoodsIndex(foodsWithMilk);
    const result = resolveFood("silk", milkIndex);
    expect(result.outcome).toBe("match");
    expect(result.food.id).toBe("milk");
    expect(result.matchType).toBe("fuzzy");
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
