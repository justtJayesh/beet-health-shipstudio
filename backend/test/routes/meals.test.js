// backend/test/routes/meals.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

async function patchMeal(id, body) {
  const res = await fetch(`${baseUrl}/api/meals/${id}`, {
    method: "PATCH",
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

  it("rejects quantity: -5 with 400 (Mongoose ValidationError)", async () => {
    const { status } = await postMeal({ food: "roti", quantity: -5, unit: "piece" });
    expect(status).toBe(400);
  });

  it("rejects quantity: 'abc' with 400 before it can propagate as NaN", async () => {
    const { status } = await postMeal({ food: "roti", quantity: "abc", unit: "piece" });
    expect(status).toBe(400);
  });

  it("rejects mealType: 'brunch' with 400 (Mongoose ValidationError, enum)", async () => {
    const { status } = await postMeal({
      food: "roti",
      quantity: 1,
      unit: "piece",
      mealType: "brunch",
    });
    expect(status).toBe(400);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await fetch(`${baseUrl}/api/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    expect(res.status).toBe(400);
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

  it("degrades gracefully when the idempotency pre-check misses but create hits the unique index (E11000 race)", async () => {
    // Simulate the race directly: a doc with the key already exists (as if
    // a concurrent request just landed it), but we force the pre-check's
    // findOne to miss once, so the route falls through to Meal.create,
    // which must then hit the duplicate-key error and recover gracefully.
    const winner = await Meal.create({
      userId: "default-user",
      foodId: "roti",
      name: "Roti",
      quantity: 1,
      unit: "piece",
      grams: 40,
      macros: { calories: 119, protein: 4.5, carbs: 23.2, fat: 1.5 },
      mealType: "breakfast",
      loggedAt: new Date(),
      idempotencyKey: "race-key",
    });

    const spy = vi.spyOn(Meal, "findOne").mockImplementationOnce(() => Promise.resolve(null));
    const { status, body } = await postMeal({
      food: "roti",
      quantity: 1,
      unit: "piece",
      idempotencyKey: "race-key",
    });
    spy.mockRestore();

    expect(status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(body.meal._id).toBe(String(winner._id));

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

  it("does not crash the server on a malformed id (Mongoose CastError) and returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/meals/not-a-valid-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(res.status).toBe(404);

    // server must still be alive for subsequent requests
    const health = await fetch(`${baseUrl}/api/meals`);
    expect(health.status).toBe(200);
  });

  it("rejects quantity: -5 with 400 (Mongoose ValidationError)", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects mealType: 'brunch' with 400 (Mongoose ValidationError, enum)", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealType: "brunch" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects quantity: 'abc' with 400 before it can propagate as NaN", async () => {
    const { body: logged } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const res = await fetch(`${baseUrl}/api/meals/${logged.meal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: "abc" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/meals/:id idempotency", () => {
  it("returns deduped:true on a repeated idempotencyKey without double-applying the edit", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const mealId = created.meal._id;

    const first = await patchMeal(mealId, { quantity: 3, idempotencyKey: "edit-key-1" });
    expect(first.status).toBe(200);
    expect(first.body.meal.quantity).toBe(3);

    const second = await patchMeal(mealId, { quantity: 3, idempotencyKey: "edit-key-1" });
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);
    expect(second.body.meal.quantity).toBe(3);
  });

  it("applies a normal edit with no idempotencyKey exactly as before", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const { status, body } = await patchMeal(created.meal._id, { quantity: 5 });
    expect(status).toBe(200);
    expect(body.meal.quantity).toBe(5);
    expect(body.deduped).toBeUndefined();
  });

  it("treats different idempotencyKeys on the same meal as independent edits", async () => {
    const { body: created } = await postMeal({ food: "roti", quantity: 1, unit: "piece" });
    const mealId = created.meal._id;

    await patchMeal(mealId, { quantity: 2, idempotencyKey: "edit-key-a" });
    const second = await patchMeal(mealId, { quantity: 4, idempotencyKey: "edit-key-b" });

    expect(second.status).toBe(200);
    expect(second.body.deduped).toBeUndefined();
    expect(second.body.meal.quantity).toBe(4);
  });

  it("degrades gracefully when meal.save() hits the unique idempotencyKey index (E11000 race), mirroring POST", async () => {
    // Force a real E11000: another meal already owns "shared-key" for this
    // user, so saving it onto a different meal collides with the unique
    // index (userId, idempotencyKey).
    await postMeal({ food: "roti", quantity: 1, unit: "piece", idempotencyKey: "shared-key" });
    const { body: other } = await postMeal({ food: "dal", quantity: 1, unit: "katori" });

    const { status, body } = await patchMeal(other.meal._id, { quantity: 2, idempotencyKey: "shared-key" });

    expect(status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(body.meal._id).toBe(other.meal._id);
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

  it("rejects ?hours=abc with 400", async () => {
    const res = await fetch(`${baseUrl}/api/meals?hours=abc`);
    expect(res.status).toBe(400);
  });

  it("rejects ?since=garbage with 400", async () => {
    const res = await fetch(`${baseUrl}/api/meals?since=garbage`);
    expect(res.status).toBe(400);
  });
});
