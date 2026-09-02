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
